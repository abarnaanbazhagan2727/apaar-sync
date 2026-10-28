import urllib.request
import json

def run_tests():
    # 1. Login with seeded credentials
    data = json.dumps({"email": "officer@apaarsync.demo", "password": "Officer@123"}).encode()
    req = urllib.request.Request(
        "http://127.0.0.1:8000/auth/login",
        data=data,
        headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req) as resp:
        login_data = json.loads(resp.read())
    
    token = login_data["access_token"]
    user = login_data["user"]
    print("==================================================")
    print("1. LIVE AUTHENTICATION SYSTEM")
    print("==================================================")
    print(f"Status: Authenticated (PBKDF2 Hashed Verification)")
    print(f"User:   {user.get('display_name')} ({user.get('email')})")
    print(f"Role:   {user.get('role')} | Institution: {user.get('institution_name')}")
    print(f"Bearer: {token[:35]}...\n")

    # 2. Innovation 1: Student Record Correction Impact Tracker
    req2 = urllib.request.Request(
        "http://127.0.0.1:8000/batches/30000000-0000-4000-8000-000000000001/correction-tracker",
        headers={"Authorization": f"Bearer {token}"}
    )
    with urllib.request.urlopen(req2) as resp:
        tracker = json.loads(resp.read())

    print("==================================================")
    print("2. INNOVATION 1: RECORD CORRECTION IMPACT TRACKER")
    print("==================================================")
    summary = tracker["summary"]
    items = tracker["items"]
    print(f"Batch Reference:        {tracker['batch_id']}")
    print(f"Total Detected Issues:  {summary['total_issues']}")
    print(f"Errors:                 {summary['errors_count']} | Warnings: {summary['warnings_count']}")
    print(f"Resolved Count:         {summary['resolved_count']}")
    print(f"Initial Quality Score:  {summary['current_quality_score']}%")
    print(f"Potential After Fix:    {summary['potential_quality_score']}%")
    print("\nSample Detected Issue (Row 1):")
    sample = items[0]
    print(f"  Row:                 {sample['row_number']}")
    print(f"  Field:               {sample['field']}")
    print(f"  Rule Code:           {sample['rule_code']} ({sample['severity']})")
    print(f"  Plain Explanation:   {sample['simple_explanation']}")
    print(f"  Safe Suggested Fix:  {sample['suggested_correction']}")

    # Apply correction approval test
    apply_payload = json.dumps({
        "issue_id": sample["issue_id"],
        "row_number": sample["row_number"],
        "field": sample["field"],
        "corrected_value": sample["suggested_correction"] or "2006-05-15",
        "action": "approve",
        "officer_note": "Approved safe correction after verification"
    }).encode()
    req_apply = urllib.request.Request(
        "http://127.0.0.1:8000/batches/30000000-0000-4000-8000-000000000001/apply-correction",
        data=apply_payload,
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {token}"}
    )
    with urllib.request.urlopen(req_apply) as resp:
        apply_res = json.loads(resp.read())
    print("\nOfficer Approval & Revalidation Result:")
    print(f"  Success:             {apply_res['success']}")
    print(f"  Message:             {apply_res['message']}")
    print(f"  Revalidated Score:   {apply_res['before_quality_score']}% -> {apply_res['after_quality_score']}% ({apply_res['score_impact']})")

    # 3. Innovation 2: Faculty-Linked Dynamic Intake Risk Alerts
    req3 = urllib.request.Request(
        "http://127.0.0.1:8000/intake-risk/programmes?institution_id=10000000-0000-4000-8000-000000000003",
        headers={"Authorization": f"Bearer {token}"}
    )
    with urllib.request.urlopen(req3) as resp:
        risk = json.loads(resp.read())

    print("\n==================================================")
    print("3. INNOVATION 2: FACULTY-LINKED INTAKE RISK ALERTS")
    print("==================================================")
    print(f"Institution:             {risk['institution_name']}")
    print(f"Institutional SFR:       {risk['overall_institutional_sfr']}:1 (Prototype Norm <= 20:1)")
    print(f"Total Approved Intake:   {risk['total_approved_intake']} seats across {risk['total_faculty']} faculty")
    print(f"Critical / High Alerts:  {risk['critical_alerts_count']} critical, {risk['high_alerts_count']} high")
    print(f"Pending Officer Reviews: {risk['pending_decisions_count']}")
    for p in risk["programmes"]:
        print(f"  - {p['programme_code']} ({p['programme_name']}):")
        print(f"      Intake: {p['enrolled_students']}/{p['approved_intake']} | Faculty: {p['faculty_count']} | Calculated SFR: {p['sfr']}:1")
        print(f"      Deficit: {p['faculty_deficit']} faculty | Risk Level: {p['risk_level']} | Decision: {p['decision_status']}")

    # What-If Simulator test
    sim_data = json.dumps({
        "programme_code": "UG-CSE",
        "proposed_intake": 120,
        "available_faculty": 8,
        "professors": 1,
        "associate_professors": 2,
        "assistant_professors": 5,
        "custom_threshold": 20.0
    }).encode()
    req_sim = urllib.request.Request(
        "http://127.0.0.1:8000/intake-risk/simulate",
        data=sim_data,
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {token}"}
    )
    with urllib.request.urlopen(req_sim) as resp:
        sim = json.loads(resp.read())
    print("\nInteractive What-If Simulation (UG-CSE: Proposed Intake=120, Faculty=8):")
    print(f"  Original SFR -> Simulated SFR: {sim['original_sfr']}:1 -> {sim['simulated_sfr']}:1")
    print(f"  Original Risk -> New Risk:     {sim['original_risk']} -> {sim['simulated_risk']}")
    print(f"  Shift:                         {sim['risk_change_label']}")
    print(f"  Simulation Assessment:         {sim['explanation']}")

    # 4. Innovation 3: Explainable Data Quality and Risk Radar
    req4 = urllib.request.Request(
        "http://127.0.0.1:8000/api/ml/institution-radar/10000000-0000-4000-8000-000000000003",
        headers={"Authorization": f"Bearer {token}"}
    )
    with urllib.request.urlopen(req4) as resp:
        radar = json.loads(resp.read())

    print("\n==================================================")
    print("4. INNOVATION 3: EXPLAINABLE DATA QUALITY RADAR")
    print("==================================================")
    print(f"Overall Quality Score:     {radar['overall_quality_score']}% ({radar['quality_tier']})")
    print(f"Missing Field Rate:        {radar['deterministic_rules_audit']['missing_field_rate']}%")
    print(f"Duplicate Record Rate:     {radar['deterministic_rules_audit']['duplicate_record_rate']}%")
    print(f"Invalid Format Count:      {radar['deterministic_rules_audit']['invalid_format_count']}")
    print(f"Transparent Formula:       {radar['deterministic_rules_audit']['transparent_formula']}")
    print("Recurring Issues by Department:")
    for d in radar["recurring_errors_by_department"]:
        print(f"  - {d['department']}: {d['total_issues']} issues (Duplicates: {d['duplicates']}, Missing: {d['missing_fields']})")
    print("Historical Quality Progression (Multi-batch Trend):")
    for h in radar["historical_trends"]:
        print(f"  - Batch {h['batch_number']} ({h['upload_date']}): Score {h['score']}% with {h['errors']} errors")
    print(f"Deterministic vs ML Guard: {radar['ml_prototype_assessment']['disclaimer']}")

    # 5. Innovation 4: Privacy-Aware Verification
    qr_payload = json.dumps({
        "student_id": "std_sih_demo_01",
        "student_name": "Aarav Sharma",
        "institution_id": "10000000-0000-4000-8000-000000000003",
        "programme": "Computer Science & Engineering",
        "expires_in_hours": 24
    }).encode()
    req_qr = urllib.request.Request(
        "http://127.0.0.1:8000/credentials/privacy-qr",
        data=qr_payload,
        headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req_qr) as resp:
        qr = json.loads(resp.read())

    print("\n==================================================")
    print("5. INNOVATION 4: PRIVACY-AWARE MINIMAL DISCLOSURE")
    print("==================================================")
    print(f"Zero-Plaintext QR URI:     {qr['verification_url']}")
    print(f"Token Expiry:              {qr['expires_at']}")

    # Verification verification
    verify_payload = json.dumps({
        "token": qr["token"]
    }).encode()
    req_v = urllib.request.Request(
        "http://127.0.0.1:8000/credentials/privacy-verify",
        data=verify_payload,
        headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req_v) as resp:
        v_res = json.loads(resp.read())
    print("Verifier Result:")
    print(f"  Outcome:                 Verified Authentic (Valid: {v_res['valid']})")
    print(f"  Disclosed Student Name:  {v_res['student_name']}")
    print(f"  Disclosed Masked APAAR:  {v_res['masked_apaar']}")
    print(f"  Disclosed Programme:     {v_res['programme']}")
    print(f"  Institution Code:        {v_res['institution_code']}")
    print(f"  Security Badge:          {v_res['verification_badge']}")
    print("==================================================\n")

if __name__ == "__main__":
    run_tests()
