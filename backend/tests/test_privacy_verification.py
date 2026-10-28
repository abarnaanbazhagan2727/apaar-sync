from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_generate_privacy_preserving_qr():
    resp = client.post("/credentials/privacy-qr", json={})
    assert resp.status_code == 200
    data = resp.json()
    assert "token" in data
    assert "verification_url" in data
    assert "masked_apaar" in data
    assert data["masked_apaar"].startswith("XXXX-XXXX-")
    assert "Aarav" in data["student_name"]


def test_verify_privacy_token_and_audit():
    # 1. Generate token
    qr_resp = client.post("/credentials/privacy-qr", json={}).json()
    token = qr_resp["token"]

    # 2. Verify token
    verify_resp = client.post("/credentials/privacy-verify", json={"token": token})
    assert verify_resp.status_code == 200
    res = verify_resp.json()
    assert res["valid"] is True
    assert res["status"] == "ADMITTED"
    assert res["masked_apaar"] == "XXXX-XXXX-4819"
    assert res["institution_name"] == "Shadow Institute of Technology"

    # 3. Check verification audit trail
    audit_resp = client.get("/credentials/privacy-audit")
    assert audit_resp.status_code == 200
    logs = audit_resp.json()
    assert len(logs) >= 1
    latest = logs[-1]
    assert latest["status"] == "VERIFIED_VALID"
    assert "Shadow" in latest["institution"]


def test_verify_tampered_token_rejected():
    tampered_token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.invalidpayload.invalidsignature"
    resp = client.post("/credentials/privacy-verify", json={"token": tampered_token})
    assert resp.status_code == 400
    assert "invalid" in resp.json()["detail"].lower() or "malformed" in resp.json()["detail"].lower()
