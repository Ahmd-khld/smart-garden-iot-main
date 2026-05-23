# Mock models module to satisfy Python imports and provide baseline data

def get_machine(asset_id):
    return None

def upsert_compliance_control(**kwargs):
    pass

def compliance_summary(framework=None):
    # Returns a structure similar to what the UI expects
    return [
        {"id": "CIS-1", "category": "Inventory/Control of Assets", "name": "Inventory of Enterprise Assets", "status": "Implemented"},
        {"id": "CIS-2", "category": "Inventory/Control of Assets", "name": "Inventory of Software Assets", "status": "Partial"},
        {"id": "CIS-3", "category": "Data Protection", "name": "Data Protection", "status": "Implemented"},
        {"id": "CIS-4", "category": "Secure Configuration", "name": "Secure Config of Enterprise Assets", "status": "Not Implemented"},
        {"id": "CIS-5", "category": "Account Management", "name": "Account Management", "status": "Implemented"},
        {"id": "CIS-6", "category": "Access Control", "name": "Access Control Management", "status": "Implemented"},
        {"id": "CIS-7", "category": "Vulnerability Management", "name": "Continuous Vuln Management", "status": "Partial"},
        {"id": "CIS-8", "category": "Audit Logs", "name": "Audit Log Management", "status": "Not Implemented"}
    ]

def list_compliance_controls(framework=None, status=None):
    return compliance_summary(framework)

# Risk engine specific mocks
def get_all_network_alerts(): return [1, 2, 3, 4, 5]
def get_all_malware_alerts(): return [1, 2]
def get_all_integrity_tamper_signals(): return [1]
def get_all_blocked_ips(): return [1, 2, 3]
def get_unowned_machines(): return [1, 2]
def get_users_without_2fa(): return [1, 2, 3, 4]
def get_all_security_events(): return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
def get_all_ueba_signals(): return [1, 2, 3]
def get_all_exposure_signals(): return [1, 2, 3, 4, 5]

def upsert_auto_risk(**kwargs):
    return 1 # Returns a mock ID

def upsert_auto_recommendation(**kwargs):
    return 1 # Returns a mock ID
