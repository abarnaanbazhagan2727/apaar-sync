from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app
from tests.conftest import as_role

client = TestClient(app)
BATCH = "30000000-0000-4000-8000-000000000001"
SHADOW = "10000000-0000-4000-8000-000000000003"


def test_correction_tracker_endpoint():
    headers = as_role("institution_operator", SHADOW)
    resp = client.get(f"/batches/{BATCH}/correction-tracker", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["batch_id"] == BATCH
    assert "summary" in data
    assert "items" in data
    assert data["summary"]["total_issues"] > 0
    first_item = data["items"][0]
    assert "simple_explanation" in first_item
    assert "suggested_correction" in first_item


def test_apply_correction_revalidates_and_audits():
    headers = as_role("institution_operator", SHADOW)
    # 1. Get tracker to fetch issue 1
    tracker = client.get(f"/batches/{BATCH}/correction-tracker", headers=headers).json()
    issue = tracker["items"][0]
    issue_id = issue["issue_id"]
    row_num = issue["row_number"]

    # 2. Apply approved correction
    payload = {
        "issue_id": issue_id,
        "row_number": row_num,
        "field": "apaar_id",
        "corrected_value": "999900001111",
        "action": "approve",
        "officer_note": "Verified with student DigiLocker card",
    }
    apply_resp = client.post(f"/batches/{BATCH}/apply-correction", json=payload, headers=headers)
    assert apply_resp.status_code == 200
    res = apply_resp.json()
    assert res["success"] is True
    assert "audit_entry" in res
    assert res["audit_entry"]["revalidation_status"] == "passed"
    assert res["audit_entry"]["officer_note"] == "Verified with student DigiLocker card"

    # 3. Check audit log endpoint
    audit_resp = client.get(f"/batches/{BATCH}/correction-audit", headers=headers)
    assert audit_resp.status_code == 200
    audit_list = audit_resp.json()
    assert len(audit_list) >= 1
    latest = audit_list[-1]
    assert latest["new_value"] == "999900001111"
    assert latest["row_number"] == row_num
