from __future__ import annotations

import jwt
from fastapi.testclient import TestClient

from app.core.security import LOCAL_JWT_ALGORITHM, LOCAL_JWT_SECRET
from app.main import app

client = TestClient(app)


def test_login_success_all_demo_roles():
    credentials = [
        ("admin@apaarsync.demo", "Admin@123", "aicte_admin"),
        ("officer@apaarsync.demo", "Officer@123", "institution_operator"),
        ("reviewer@apaarsync.demo", "Reviewer@123", "auditor"),
    ]
    for email, pwd, expected_role in credentials:
        resp = client.post("/auth/login", json={"username_or_email": email, "password": pwd})
        assert resp.status_code == 200, f"Failed for {email}: {resp.text}"
        data = resp.json()
        assert "access_token" in data
        assert data["token_type"] == "Bearer"
        assert data["user"]["role"] == expected_role
        assert data["user"]["email"] == email

        # Verify bearer token works against /me
        token = data["access_token"]
        me_resp = client.get("/me", headers={"Authorization": f"Bearer {token}"})
        assert me_resp.status_code == 200
        assert me_resp.json()["role"] == expected_role


def test_login_with_username_alias():
    resp = client.post("/auth/login", json={"username_or_email": "admin", "password": "Admin@123"})
    assert resp.status_code == 200
    assert resp.json()["user"]["role"] == "aicte_admin"


def test_login_invalid_password():
    resp = client.post("/auth/login", json={"username_or_email": "admin@apaarsync.demo", "password": "WrongPassword!"})
    assert resp.status_code == 401
    assert "Invalid email or password" in resp.json()["detail"]


def test_login_nonexistent_user():
    resp = client.post("/auth/login", json={"username_or_email": "unknown@domain.com", "password": "SomePassword123"})
    assert resp.status_code == 401


def test_expired_token_rejected():
    # Create an intentionally expired token
    expired_payload = {
        "sub": "demo-admin-001",
        "email": "admin@apaarsync.demo",
        "role": "aicte_admin",
        "exp": 1000000000,  # Far in the past
        "iat": 999999990,
    }
    expired_token = jwt.encode(expired_payload, LOCAL_JWT_SECRET, algorithm=LOCAL_JWT_ALGORITHM)
    resp = client.get("/me", headers={"Authorization": f"Bearer {expired_token}"})
    assert resp.status_code == 401
    assert "expired" in resp.json()["detail"].lower()


def test_logout():
    resp = client.post("/auth/logout")
    assert resp.status_code == 200
    assert resp.json()["success"] is True


def test_demo_credentials_list():
    resp = client.get("/auth/demo-credentials")
    assert resp.status_code == 200
    items = resp.json()
    assert len(items) == 3
    emails = {item["email"] for item in items}
    assert "admin@apaarsync.demo" in emails
    assert "officer@apaarsync.demo" in emails
    assert "reviewer@apaarsync.demo" in emails
