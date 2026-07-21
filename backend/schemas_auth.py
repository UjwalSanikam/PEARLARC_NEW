from pydantic import BaseModel, field_validator
from typing import Optional
import re

PHONE_PATTERN = re.compile(r"^\+?[0-9]{7,15}$")

def normalize_identifier(v: str) -> str:
    v = v.strip()
    if "@" in v:
        return v.lower()  # emails: case-insensitive match

    # Phone: strip spaces/dashes, default to +91 if no country code given
    digits_only = re.sub(r"[^\d+]", "", v)
    if not digits_only.startswith("+"):
        digits_only = "+91" + digits_only.lstrip("0")
    return digits_only

class UserCreate(BaseModel):
    identifier: str
    password: str

    @field_validator("identifier")
    @classmethod
    def validate_identifier(cls, v: str) -> str:
        normalized = normalize_identifier(v)
        is_email = "@" in normalized
        is_phone = bool(PHONE_PATTERN.match(normalized))
        if not (is_email or is_phone):
            raise ValueError("Must be a valid email address or phone number.")
        return normalized

    @field_validator("password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters long.")
        if not re.search(r"[A-Z]", v):
            raise ValueError("Password must contain at least one uppercase letter.")
        if not re.search(r"[0-9]", v):
            raise ValueError("Password must contain at least one number.")
        if not re.search(r"[!@#$%^&*(),.?\":{}|<>_\-+=/\\;'\[\]]", v):
            raise ValueError("Password must contain at least one special character.")
        return v

class UserLogin(BaseModel):
    identifier: str
    password: str

    @field_validator("identifier")
    @classmethod
    def validate_identifier(cls, v: str) -> str:
        return normalize_identifier(v)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"