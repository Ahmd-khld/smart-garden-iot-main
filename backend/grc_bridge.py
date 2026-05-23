import json
import sys
import os

# Ensure the script can find its sibling modules (risk_engine, compliance)
script_dir = os.path.dirname(os.path.abspath(__file__))
if script_dir not in sys.path:
    sys.path.insert(0, script_dir)

# Import existing Python analysis functions
try:
    from risk_engine import derive_risks
    from compliance import posture
except ImportError as e:
    print(json.dumps({"error": f"Failed to import Python modules: {str(e)}", "path": sys.path}))
    sys.exit(1)

def main():
    try:
        # Aggregate data from both engines
        raw_risks = derive_risks()
        compliance_data = posture()
        
        # Format risks for the summary view
        formatted_risks = {}
        for key, count in raw_risks.items():
            if key == "total": continue
            
            level = "Low" if count < 5 else "Medium" if count < 15 else "High"
            status = "Optimal" if count < 3 else "Vigilant" if count < 10 else "Warning"
            
            formatted_risks[f"{key}_risks" if not key.endswith("risks") else key] = {
                "count": count,
                "score": count * 5,
                "level": level,
                "status": status
            }

        # Generate a detailed Risk Register for the table
        # In a real app, this would fetch from a 'risks' table populated by risk_engine.py
        risk_register = [
            {
                "id": "RISK-001", 
                "category": "Network", 
                "description": "Repeated brute force attacks from 192.168.1.105", 
                "asset": "Web Server 01", 
                "likelihood": 4, 
                "impact": 5, 
                "status": "Open",
                "recommendations": [
                    {"title": "Block Source IP", "body": "Add a firewall rule to block 192.168.1.105.", "priority": "high"},
                    {"title": "Enable Rate Limiting", "body": "Implement connection limits on the web server.", "priority": "medium"}
                ]
            },
            {
                "id": "RISK-002", 
                "category": "Malware", 
                "description": "Unsigned binary detected in /tmp on DB-Master", 
                "asset": "Database Master", 
                "likelihood": 2, 
                "impact": 5, 
                "status": "Mitigating",
                "recommendations": [
                    {"title": "Quarantine File", "body": "Move the detected binary to a secure isolation folder.", "priority": "high"},
                    {"title": "Run Full Scan", "body": "Trigger a deep EDR scan on DB-Master.", "priority": "medium"}
                ]
            },
            {
                "id": "RISK-003", 
                "category": "Integrity", 
                "description": "System hive mismatch detected on Domain Controller", 
                "asset": "DC-01", 
                "likelihood": 5, 
                "impact": 5, 
                "status": "Open",
                "recommendations": [
                    {"title": "Verify Hash", "body": "Manually check the system hive hash against the last known baseline.", "priority": "critical"},
                    {"title": "Isolate DC", "body": "Temporarily restrict network traffic to the DC until verified.", "priority": "high"}
                ]
            },
            {
                "id": "RISK-004", 
                "category": "Account", 
                "description": "Admin user \"jsmith\" has 2FA disabled", 
                "asset": "IAM Service", 
                "likelihood": 3, 
                "impact": 4, 
                "status": "Accepted",
                "recommendations": [
                    {"title": "Enforce TOTP", "body": "Force MFA enrollment for user 'jsmith' on next login.", "priority": "high"}
                ]
            },
            {
                "id": "RISK-005", 
                "category": "Config", 
                "description": "Critical asset \"Jump-Host\" has no owner assigned", 
                "asset": "Jump-Host", 
                "likelihood": 3, 
                "impact": 3, 
                "status": "Open",
                "recommendations": [
                    {"title": "Assign Asset Owner", "body": "Determine the responsible stakeholder for 'Jump-Host' and update the asset register.", "priority": "medium"}
                ]
            },
        ]

        # Calculate overall percentage
        implemented = [c for c in compliance_data if str(c.get('status')).lower() == 'implemented']
        overall_pct = int((len(implemented) / len(compliance_data)) * 100) if compliance_data else 0

        final_output = {
            "timestamp": None,
            "risks_summary": formatted_risks,
            "risk_register": risk_register,
            "compliance": compliance_data,
            "overall_compliance_pct": overall_pct
        }

        # Output to stdout for Node.js to capture
        print(json.dumps(final_output))
        
    except Exception as e:
        print(json.dumps({"error": f"GRC Bridge Runtime Error: {str(e)}"}))
        sys.exit(1)

if __name__ == "__main__":
    main()
