# Owner: Dev B
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel

Role = Literal[
    "institution_admin", "institution_operator", "aicte_admin", "student", "verifier", "auditor"
]


class User(BaseModel):
    id: str
    role: Role
    institution_id: str | None = None
    display_name: str | None = None
    demo: bool = False
    # Students only: the students.id this account is, from app_metadata.student_id.
    student_id: str | None = None
    email: str | None = None
    institution_name: str | None = None


class LoginRequest(BaseModel):
    username_or_email: str | None = None
    email: str | None = None
    password: str

    @property
    def identifier(self) -> str:
        return self.username_or_email or self.email or ""


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "Bearer"
    expires_in: int = 86400  # 24 hours in seconds
    user: User


class LogoutResponse(BaseModel):
    success: bool = True
    message: str = "Successfully logged out"


class DemoAccountInfo(BaseModel):
    role_key: str
    role_label: str
    email: str
    display_name: str
    institution_name: str | None = None
    institution_id: str | None = None
    description: str

