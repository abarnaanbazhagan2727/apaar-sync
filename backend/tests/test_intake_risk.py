from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app
from tests.conftest import as_role

client = TestClient(app)
SHADOW = "10000000-0000-4000-8000-000000000003"


def test_get_intake_risk_overview():
    headers = as_role("institution_operator", SHADOW)
    resp = client.get("/intake-risk/programmes", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "total_approved_intake" in data
    assert "total_faculty" in data
    assert "overall_institutional_sfr" in data
    assert len(data["programmes"]) >= 4

    cse = next((p for p in data["programmes"] if p["programme_code"] == "UG-CSE"), None)
    assert cse is not None
    assert cse["approved_intake"] == 180
    assert cse["faculty_count"] == 6
    assert cse["sfr"] == 30.0
    assert cse["risk_level"] == "CRITICAL"


def test_what_if_simulator_mitigates_risk():
    headers = as_role("institution_operator", SHADOW)
    # Simulate adding 3 faculty members to UG-CSE (from 6 to 9)
    sim_payload = {
        "programme_code": "UG-CSE",
        "proposed_intake": 180,
        "available_faculty": 9,
        "professors": 1,
        "associate_professors": 2,
        "assistant_professors": 6,
        "custom_threshold": 20.0,
    }
    resp = client.post("/intake-risk/simulate", json=sim_payload, headers=headers)
    assert resp.status_code == 200
    sim = resp.json()
    assert sim["original_risk"] == "CRITICAL"
    assert sim["simulated_sfr"] == 20.0
    assert sim["simulated_risk"] in ("COMPLIANT", "MODERATE")
    assert "RISK MITIGATED" in sim["risk_change_label"]


def test_record_officer_decision_and_audit():
    headers = as_role("institution_admin", SHADOW)
    decision_payload = {
        "decision_action": "ACKNOWLEDGE_RECRUITMENT",
        "officer_notes": "Board approved recruitment of 3 Assistant Professors before next semester.",
    }
    resp = client.post("/intake-risk/UG-CSE/decide", json=decision_payload, headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["success"] is True
    assert data["programme_code"] == "UG-CSE"

    audit_resp = client.get("/intake-risk/audit", headers=headers)
    assert audit_resp.status_code == 200
    audit_log = audit_resp.json()
    assert len(audit_log) >= 1
    latest = audit_log[-1]
    assert latest["programme_code"] == "UG-CSE"
    assert latest["decision_action"] == "ACKNOWLEDGE_RECRUITMENT"
