"""
modules/risk_engine.py

Auto-derives Risk Register entries from existing security signals and
attaches a canonical set of recommendations to each one.

Inputs (all read-only — engine never mutates source tables):
- network_alerts          -> "Repeated attacks from <IP>" risks
- malware_alerts          -> "Malware on <host>" risks (any detection)
                             AND  "Integrity tamper: <path>" risks
                                  (rows with rf_prediction='integrity_mismatch')
- blocked_ips             -> "Active firewall block on <IP>" risks
- machines                -> "Critical asset without owner" risks
- users (totp_enabled=0)  -> "Account without 2FA" risks

Outputs:
- risks rows                  (idempotent via dedupe_key)
- recommendations rows         (idempotent via dedupe_key)

Likelihood / impact scoring
- likelihood (1-5): scaled from the signal's volume / recency
- impact     (1-5): asset criticality (low=2, medium=3, high=4, critical=5)
                    or a per-category default if no asset is linked.
"""

from __future__ import annotations

from typing import Iterable, Optional

from database import db, models


# -----------------------------------------------------------------------------
# Scoring helpers
# -----------------------------------------------------------------------------
_CRITICALITY_TO_IMPACT = {
    "low": 2, "medium": 3, "high": 4, "critical": 5,
}


def _impact_from_asset(asset_id: Optional[int], default: int = 3) -> int:
    if asset_id is None:
        return default
    asset = models.get_machine(asset_id)
    if not asset:
        return default
    return _CRITICALITY_TO_IMPACT.get(asset.get("criticality") or "medium", 3)


def _likelihood_from_count(n: int, *, low: int = 1, mid: int = 5,
                           high: int = 20, top: int = 50) -> int:
    """Map an event count to a 1-5 likelihood band."""
    if n >= top:
        return 5
    if n >= high:
        return 4
    if n >= mid:
        return 3
    if n >= low:
        return 2
    return 1


def _hostname_to_asset_id(hostname: str) -> Optional[int]:
    """Look up the machines.id for a given hostname; None if not registered."""
    if not hostname:
        return None
    with db.connection() as conn:
        row = conn.execute(
            "SELECT id FROM machines WHERE hostname = ?", (hostname,)
        ).fetchone()
        return int(row["id"]) if row else None


# -----------------------------------------------------------------------------
# Recommendation playbook
#
# Maps each risk category (and a few specific signal types) to a list of
# canonical remediations. Each entry is a (suffix, title, body, priority).
# `suffix` makes the recommendation's dedupe_key unique within its parent risk.
# -----------------------------------------------------------------------------
_PLAYBOOK: dict[str, list[tuple[str, str, str, str]]] = {
    "network": [
        ("block",
         "Block the offending source IP at the firewall",
         "Add a Windows Firewall block rule via the Network Monitor tab "
         "(Manual IPS controls). Verify the rule shows up under "
         "`netsh advfirewall firewall show rule name=UTD_BLOCK_<ip>`.",
         "high"),
        ("investigate",
         "Investigate the source IP in Threat Intelligence",
         "Look up the source in AbuseIPDB / VirusTotal / GeoIP to decide "
         "whether this is a known scanner, a botnet member, or someone "
         "with a legitimate but misbehaving service.",
         "medium"),
        ("review_logs",
         "Review network alerts for this source over the last 24 h",
         "Filter the History tab by the source IP to confirm pattern "
         "and timing. Capture pcap if you need evidence.",
         "medium"),
    ],
    "malware": [
        ("isolate",
         "Isolate the affected host from the network",
         "Disable the host's NIC or move it to a quarantine VLAN until "
         "the file has been triaged.",
         "critical"),
        ("scan",
         "Run a full antivirus / EDR scan on the host",
         "Trigger Defender / your EDR's full-disk scan and capture the "
         "report. Cross-check the file hash on VirusTotal.",
         "high"),
        ("delete_or_quarantine",
         "Quarantine or delete the malicious file",
         "Use the File Monitor tab's Remove action, then verify the "
         "quarantine via the audit log.",
         "high"),
    ],
    "integrity": [
        ("verify_patch",
         "Confirm the change is from a legitimate Windows update",
         "Check Windows Update history for changes near the alert "
         "timestamp. If it lines up with a patch, this is likely benign.",
         "medium"),
        ("rebaseline",
         "Re-baseline the file once the change is validated",
         "From the System Integrity tab, click 'Set baseline' to capture "
         "the new known-good state.",
         "medium"),
        ("incident_response",
         "Open an incident if the change isn't tied to a patch",
         "Tampered SAM / SYSTEM hives often indicate credential-dumping "
         "(MITRE T1003). Capture memory + disk image before remediation.",
         "critical"),
    ],
    "account": [
        ("enable_2fa",
         "Enrol the account in TOTP 2FA",
         "From the sidebar's Account & 2FA expander, scan the QR with an "
         "authenticator app and confirm the 6-digit code.",
         "high"),
        ("force_pwd",
         "Force a password reset on next login",
         "From the Admin tab, click 'Reset password' for the user. They "
         "will be required to set a new password on next sign-in.",
         "medium"),
    ],
    "config": [
        ("assign_owner",
         "Assign an owner to the asset",
         "From the Asset Register, edit the row and fill in the Owner "
         "field. Critical assets without owners get lost during incidents.",
         "medium"),
        ("review_criticality",
         "Confirm the asset's criticality is set correctly",
         "Walk through what would break if this asset went down for an "
         "hour, then reconcile with the Criticality field.",
         "low"),
    ],
}


def _attach_playbook(risk_id: int, dedupe_key: str, category: str) -> int:
    """Generate auto-recommendations for a risk. Returns count attached."""
    plays = _PLAYBOOK.get(category, [])
    n = 0
    for suffix, title, body, priority in plays:
        try:
            models.upsert_auto_recommendation(
                risk_id=risk_id,
                dedupe_key=f"{dedupe_key}::{suffix}",
                title=title,
                body=body,
                priority=priority,
            )
            n += 1
        except Exception:
            continue
    return n


# -----------------------------------------------------------------------------
# Per-source derivers
# -----------------------------------------------------------------------------
def _derive_network_risks() -> list[int]:
    """Top attacker IPs across all sessions -> one risk per IP."""
    out: list[int] = []
    with db.connection() as conn:
        rows = conn.execute(
            """SELECT src_ip,
                      COUNT(*)                  AS hits,
                      COUNT(DISTINCT attack_type) AS distinct_types,
                      MAX(attack_type)          AS sample_attack,
                      MAX(timestamp)            AS last_seen
               FROM network_alerts
               WHERE attack_type != 'Normal'
               GROUP BY src_ip
               HAVING hits >= 3
               ORDER BY hits DESC
               LIMIT 50"""
        ).fetchall()
    for r in rows:
        src_ip = r["src_ip"]
        hits = int(r["hits"])
        likelihood = _likelihood_from_count(hits, low=3, mid=10, high=30, top=100)
        # Network risks usually target an unknown asset (the attacker's target
        # rotates). Default impact medium; bump if multiple distinct attack
        # types observed (likely active campaign).
        impact = 3 + (1 if int(r["distinct_types"]) >= 3 else 0)
        dedupe_key = f"network:src:{src_ip}"
        rid = models.upsert_auto_risk(
            dedupe_key=dedupe_key,
            title=f"Repeated network attacks from {src_ip}",
            description=(f"{hits} alert(s) attributed to {src_ip}. "
                         f"Latest sample attack class: "
                         f"{r['sample_attack']}. Last seen {r['last_seen']}."),
            category="network",
            asset_id=None,
            source_signal=f"{hits} network_alerts; {r['distinct_types']} distinct types",
            likelihood=likelihood,
            impact=impact,
        )
        if rid:
            _attach_playbook(rid, dedupe_key, "network")
            out.append(rid)
    return out


def _derive_malware_risks() -> list[int]:
    """Confirmed malware detections grouped per session host."""
    out: list[int] = []
    with db.connection() as conn:
        # Join malware_alerts -> sessions -> machines so we can pin to an asset.
        rows = conn.execute(
            """SELECT s.hostname              AS hostname,
                      COUNT(*)                AS hits,
                      MAX(ma.timestamp)       AS last_seen,
                      MAX(ma.file_path)       AS sample_path
               FROM malware_alerts ma
               JOIN sessions s ON s.id = ma.session_id
               WHERE ma.is_malware = 1
               GROUP BY s.hostname
               HAVING hits >= 1
               ORDER BY hits DESC"""
        ).fetchall()
    for r in rows:
        host = r["hostname"]
        hits = int(r["hits"])
        asset_id = _hostname_to_asset_id(host)
        likelihood = _likelihood_from_count(hits, low=1, mid=3, high=10, top=25)
        impact = _impact_from_asset(asset_id, default=4)
        dedupe_key = f"malware:host:{host}"
        rid = models.upsert_auto_risk(
            dedupe_key=dedupe_key,
            title=f"Malware detected on host {host}",
            description=(f"{hits} confirmed malware detection(s) on {host}. "
                         f"Sample path: {r['sample_path']}. "
                         f"Latest: {r['last_seen']}."),
            category="malware",
            asset_id=asset_id,
            source_signal=f"{hits} malware_alerts where is_malware=1",
            likelihood=likelihood,
            impact=impact,
        )
        if rid:
            _attach_playbook(rid, dedupe_key, "malware")
            out.append(rid)
    return out


def _derive_integrity_risks() -> list[int]:
    """One risk per file currently in 'mismatch' state."""
    out: list[int] = []
    with db.connection() as conn:
        rows = conn.execute(
            """SELECT file_path, last_alert_ts
               FROM integrity_baseline
               WHERE last_status = 'mismatch'"""
        ).fetchall()
    for r in rows:
        path = r["file_path"]
        # SAM hives are critical by definition; everything else gets a 4.
        is_hive = any(s in path.upper() for s in
                      (r"\CONFIG\SAM", r"\CONFIG\SYSTEM",
                       r"\CONFIG\SECURITY", r"\CONFIG\SOFTWARE"))
        impact = 5 if is_hive else 4
        likelihood = 5  # mismatch already happened
        dedupe_key = f"integrity:path:{path.lower()}"
        rid = models.upsert_auto_risk(
            dedupe_key=dedupe_key,
            title=f"Integrity tamper detected: {path}",
            description=(f"The integrity baseline for {path} no longer "
                         f"matches the live file. Last alert: "
                         f"{r['last_alert_ts']}."),
            category="integrity",
            asset_id=None,
            source_signal="integrity_baseline.last_status='mismatch'",
            likelihood=likelihood,
            impact=impact,
        )
        if rid:
            _attach_playbook(rid, dedupe_key, "integrity")
            out.append(rid)
    return out


def _derive_account_risks() -> list[int]:
    """Active admin/viewer accounts that don't have 2FA enabled."""
    out: list[int] = []
    with db.connection() as conn:
        rows = conn.execute(
            """SELECT id, username, role
               FROM users
               WHERE is_active = 1 AND totp_enabled = 0"""
        ).fetchall()
    for r in rows:
        username = r["username"]
        role = r["role"]
        # Admins without 2FA are higher-impact than viewers.
        impact = 5 if role == "admin" else 3
        likelihood = 4
        dedupe_key = f"account:no2fa:{username}"
        rid = models.upsert_auto_risk(
            dedupe_key=dedupe_key,
            title=f"User '{username}' has 2FA disabled",
            description=(f"Account '{username}' (role={role}) is active but "
                         f"does not have TOTP 2FA enabled. Compromised "
                         f"credentials grant full access on a single factor."),
            category="account",
            asset_id=None,
            source_signal="users.totp_enabled=0",
            likelihood=likelihood,
            impact=impact,
        )
        if rid:
            _attach_playbook(rid, dedupe_key, "account")
            out.append(rid)
    return out


def _derive_config_risks() -> list[int]:
    """Asset hygiene: high-criticality machines without an owner."""
    out: list[int] = []
    with db.connection() as conn:
        rows = conn.execute(
            """SELECT id, hostname, criticality, owner
               FROM machines
               WHERE (owner IS NULL OR TRIM(owner) = '')
                 AND criticality IN ('high','critical')"""
        ).fetchall()
    for r in rows:
        host = r["hostname"]
        crit = r["criticality"]
        impact = _CRITICALITY_TO_IMPACT.get(crit, 3)
        dedupe_key = f"config:noowner:{host}"
        rid = models.upsert_auto_risk(
            dedupe_key=dedupe_key,
            title=f"Critical asset '{host}' has no owner assigned",
            description=(f"{host} is marked criticality={crit} but has no "
                         f"owner in the asset register. Without an owner, "
                         f"incident response gets stuck during triage."),
            category="config",
            asset_id=int(r["id"]),
            source_signal="machines.owner IS NULL AND criticality>='high'",
            likelihood=3,
            impact=impact,
        )
        if rid:
            _attach_playbook(rid, dedupe_key, "config")
            out.append(rid)
    return out


# -----------------------------------------------------------------------------
# UEBA / Exposure hooks - layered on top of the static derivers above. The
# scorers in modules/ueba.py and modules/exposure.py are imported lazily to
# avoid an import cycle at module-load time.
# -----------------------------------------------------------------------------
def _derive_ueba_risks(min_score: int = 61) -> list[int]:
    """Top-scoring users from UEBA become account-category risks."""
    out: list[int] = []
    try:
        from modules import ueba
    except Exception:
        return out
    try:
        scored = ueba.score_users(limit=50)
    except Exception:
        return out
    for u in scored:
        if int(u.get("score") or 0) < min_score:
            continue
        score = int(u["score"])
        # Map UEBA tier to risk likelihood (HIGH=4, CRIT=5).
        likelihood = 5 if score >= 81 else 4
        impact = 5 if (u.get("role") == "admin") else 3
        username = u["username"]
        dedupe_key = f"ueba:user:{username}"
        rid = models.upsert_auto_risk(
            dedupe_key=dedupe_key,
            title=f"User '{username}' shows risky behaviour (UEBA score {score})",
            description=(f"UEBA scored '{username}' at {score}/100 "
                         f"({u.get('tier','?').upper()}). "
                         f"Drivers: " + ", ".join(
                             s["label"] for s in u.get("signals", [])
                             if int(s.get("points") or 0) > 0)),
            category="account",
            asset_id=None,
            source_signal=f"UEBA score={score}",
            likelihood=likelihood,
            impact=impact,
        )
        if rid:
            _attach_playbook(rid, dedupe_key, "account")
            out.append(rid)
    return out


def _derive_exposure_risks(min_score: int = 61) -> list[int]:
    """Top-scoring assets from Exposure become config-category risks."""
    out: list[int] = []
    try:
        from modules import exposure
    except Exception:
        return out
    try:
        scored = exposure.score_assets()
    except Exception:
        return out
    for a in scored:
        if int(a.get("score") or 0) < min_score:
            continue
        score = int(a["score"])
        likelihood = 5 if score >= 81 else 4
        crit = (a.get("criticality") or "medium").lower()
        impact = _CRITICALITY_TO_IMPACT.get(crit, 3)
        host = a.get("hostname") or "?"
        dedupe_key = f"exposure:asset:{host}"
        rid = models.upsert_auto_risk(
            dedupe_key=dedupe_key,
            title=f"Asset '{host}' is highly exposed (score {score})",
            description=(f"Exposure scored {host} at {score}/100 "
                         f"({a.get('tier','?').upper()}). "
                         f"Drivers: " + ", ".join(
                             s["label"] for s in a.get("signals", [])
                             if int(s.get("points") or 0) > 0)),
            category="config",
            asset_id=int(a.get("machine_id") or 0) or None,
            source_signal=f"Exposure score={score}",
            likelihood=likelihood,
            impact=impact,
        )
        if rid:
            _attach_playbook(rid, dedupe_key, "config")
            out.append(rid)
    return out


# -----------------------------------------------------------------------------
# Public entry
# -----------------------------------------------------------------------------
def derive_risks() -> dict:
    """
    Run every deriver. Returns a summary dict the UI can render directly.
    Idempotent: running twice in a row produces the same DB state (apart from
    updated_at on existing rows).
    """
    network = _derive_network_risks()
    malware = _derive_malware_risks()
    integrity = _derive_integrity_risks()
    account = _derive_account_risks()
    config = _derive_config_risks()
    ueba_risks = _derive_ueba_risks()
    exposure_risks = _derive_exposure_risks()
    return {
        "network":   len(network),
        "malware":   len(malware),
        "integrity": len(integrity),
        "account":   len(account),
        "config":    len(config),
        "ueba":      len(ueba_risks),
        "exposure":  len(exposure_risks),
        "total":     (len(network) + len(malware) + len(integrity)
                      + len(account) + len(config)
                      + len(ueba_risks) + len(exposure_risks)),
    }
