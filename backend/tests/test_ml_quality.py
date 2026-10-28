# Owner: APAAR-Sync / SIH 2026
"""Unit tests for ML Data Quality verification and prototype Random Forest predictor."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

HEADERS = {
    "X-Demo-Role": "institution_admin",
    "X-Demo-Institution": "1-0000000001",
}


def test_model_info_safe():
    """Verify model info exposes safe metadata without server filesystem leaks."""
    response = client.get("/api/ml/model-info", headers=HEADERS)
    assert response.status_code == 200
    data = response.json()
    assert data["status"] in ("ready", "missing_file")
    assert data["model_type"] == "RandomForestClassifier"
    assert data["features"] == [
        "missing_fields",
        "duplicate_flag",
        "invalid_id_format",
        "invalid_age",
        "invalid_department",
        "invalid_marks",
    ]
    assert data["classes"] == [0, 1]
    assert "disclaimer" in data
    # Ensure no filesystem path leaks
    body_str = response.text.lower()
    assert "c:\\" not in body_str
    assert "/users/" not in body_str
    assert ".joblib" not in body_str


def test_predict_clean_record():
    """Clean record with all zeros should predict 'No Issue Flagged'."""
    payload = {
        "missing_fields": 0,
        "duplicate_flag": 0,
        "invalid_id_format": 0,
        "invalid_age": 0,
        "invalid_department": 0,
        "invalid_marks": 0,
    }
    response = client.post("/api/ml/predict", json=payload, headers=HEADERS)
    assert response.status_code == 200
    data = response.json()
    assert data["prediction"] == 0
    assert data["label"] == "No Issue Flagged"
    assert data["issue_probability"] <= 0.5
    assert data["clean_probability"] >= 0.5
    assert "Prototype Data-Quality Risk Score" in data["prototype_score_label"]
    assert "disclaimer" in data


def test_predict_user_example():
    """User-specified example: missing_fields=2, invalid_id_format=1."""
    payload = {
        "missing_fields": 2,
        "duplicate_flag": 0,
        "invalid_id_format": 1,
        "invalid_age": 0,
        "invalid_department": 0,
        "invalid_marks": 0,
    }
    response = client.post("/api/ml/predict", json=payload, headers=HEADERS)
    assert response.status_code == 200
    data = response.json()
    assert data["prediction"] == 1
    assert data["label"] == "Potential Data Issue"
    assert data["issue_probability"] > 0.5
    assert any("2 required field" in w for w in data["warnings"])
    assert any("APAAR" in w for w in data["warnings"])


def test_predict_alias_endpoint():
    """Verify /ml/predict produces identical response to /api/ml/predict."""
    payload = {
        "missing_fields": 1,
        "duplicate_flag": 1,
        "invalid_id_format": 0,
        "invalid_age": 0,
        "invalid_department": 0,
        "invalid_marks": 0,
    }
    res1 = client.post("/api/ml/predict", json=payload, headers=HEADERS)
    res2 = client.post("/ml/predict", json=payload, headers=HEADERS)
    assert res1.status_code == 200
    assert res2.status_code == 200
    assert res1.json()["prediction"] == res2.json()["prediction"]
    assert res1.json()["issue_probability"] == res2.json()["issue_probability"]


def test_predict_invalid_feature_ranges():
    """Validate input bounds: binary flags must be 0 or 1, missing_fields >= 0."""
    # Negative missing fields
    res1 = client.post(
        "/api/ml/predict",
        json={
            "missing_fields": -1,
            "duplicate_flag": 0,
            "invalid_id_format": 0,
            "invalid_age": 0,
            "invalid_department": 0,
            "invalid_marks": 0,
        },
        headers=HEADERS,
    )
    assert res1.status_code == 422

    # Non-binary duplicate flag
    res2 = client.post(
        "/api/ml/predict",
        json={
            "missing_fields": 0,
            "duplicate_flag": 2,
            "invalid_id_format": 0,
            "invalid_age": 0,
            "invalid_department": 0,
            "invalid_marks": 0,
        },
        headers=HEADERS,
    )
    assert res2.status_code == 422

    # Missing required attribute
    res3 = client.post(
        "/api/ml/predict",
        json={
            "missing_fields": 0,
            "duplicate_flag": 0,
        },
        headers=HEADERS,
    )
    assert res3.status_code == 422


def test_evaluate_student_record_flow():
    """Combined deterministic checks and ML prediction for student records."""
    record = {
        "student_name": "Aarav Sharma",
        "apaar_id": "123456789012",
        "dob": "2005-04-12",
        "programme_code": "CSE",
        "qualifying_exam_pct": 88.5,
        "gender": "male",
        "category": "general",
        "seat_pool": "regular",
        "domicile_state": "MH",
    }
    response = client.post("/api/ml/evaluate-record", json=record, headers=HEADERS)
    assert response.status_code == 200
    data = response.json()
    assert data["features_derived"]["missing_fields"] == 0
    assert data["features_derived"]["invalid_id_format"] == 0
    assert data["features_derived"]["invalid_age"] == 0
    assert data["features_derived"]["invalid_department"] == 0
    assert data["features_derived"]["invalid_marks"] == 0
    assert data["prediction"]["label"] == "No Issue Flagged"
    assert len(data["deterministic_findings"]) == 0


def test_evaluate_student_record_with_anomalies():
    """Candidate with invalid APAAR (non-12 digits) and invalid marks."""
    record = {
        "student_name": "Ananya Patel",
        "apaar_id": "12345",  # Malformed
        "dob": "1950-01-01",  # Age > 60
        "programme_code": "CSE",
        "qualifying_exam_pct": 140.0,  # Out of range > 100
        "gender": "female",
        "category": "general",
        "seat_pool": "regular",
    }
    response = client.post("/api/ml/evaluate-record", json=record, headers=HEADERS)
    assert response.status_code == 200
    data = response.json()
    assert data["features_derived"]["invalid_id_format"] == 1
    assert data["features_derived"]["invalid_age"] == 1
    assert data["features_derived"]["invalid_marks"] == 1
    assert data["prediction"]["prediction"] == 1
    assert data["prediction"]["label"] == "Potential Data Issue"
    assert len(data["deterministic_findings"]) >= 3


def test_batch_quality_endpoint():
    """Verify batch evaluation returns summary with separate deterministic & ML metrics."""
    response = client.get("/api/ml/batch/mock-batch-001", headers=HEADERS)
    assert response.status_code == 200
    data = response.json()
    assert "batch_ml_summary" in data
    assert "sample_features" in data
    assert "counts" in data
    assert "disclaimer" in data
