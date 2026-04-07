from __future__ import annotations

import base64
import hashlib
import json
import os
import secrets
from pathlib import Path

from cryptography.hazmat.primitives.ciphers.aead import AESGCM


ROOT = Path(__file__).resolve().parents[1]
AUTH_USER = os.environ.get("TILDA_DASHBOARD_USER")
AUTH_PASSWORD = os.environ.get("TILDA_DASHBOARD_PASSWORD")
AUTH_USERS_JSON = os.environ.get("TILDA_DASHBOARD_USERS_JSON")
AUTH_USERS_FILE = os.environ.get("TILDA_DASHBOARD_USERS_FILE")
AUTH_ITERATIONS = 240_000
PAYLOAD_ITERATIONS = 240_000

SOURCES = [
    (
        "site-stats",
        [ROOT / "private/site-stats.json", ROOT / "data/site-stats.json"],
        ROOT / "data/site-stats.enc.json",
    ),
    (
        "vgs2000-stats",
        [ROOT / "private/vgs2000-stats.json", ROOT / "data/vgs2000-stats.json"],
        ROOT / "data/vgs2000-stats.enc.json",
    ),
]


def b64(value: bytes) -> str:
    return base64.b64encode(value).decode("ascii")


def derive_key(secret: str, salt: bytes, iterations: int, length: int = 32) -> bytes:
    return hashlib.pbkdf2_hmac("sha256", secret.encode("utf-8"), salt, iterations, dklen=length)


def parse_existing_js_assignment(path: Path, prefix: str) -> dict[str, object] | None:
    if not path.exists():
        return None

    raw = path.read_text(encoding="utf-8").strip()
    if not raw.startswith(prefix):
        return None

    body = raw[len(prefix) :].strip()
    if body.endswith(";"):
        body = body[:-1]

    try:
        parsed = json.loads(body)
    except json.JSONDecodeError:
        return None

    return parsed if isinstance(parsed, dict) else None


def parse_existing_payload(path: Path) -> dict[str, object] | None:
    if not path.exists():
        return None

    try:
        parsed = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return None

    return parsed if isinstance(parsed, dict) else None


def normalize_users(raw_users: object) -> list[dict[str, str]]:
    if not isinstance(raw_users, list):
        raise SystemExit("Users payload must be a JSON array of objects with username/password.")

    normalized: list[dict[str, str]] = []
    seen: set[str] = set()

    for item in raw_users:
        if not isinstance(item, dict):
            raise SystemExit("Each user entry must be an object with username/password.")
        username = str(item.get("username", "")).strip()
        password = str(item.get("password", ""))
        if not username or not password:
            raise SystemExit("Each user entry must include non-empty username and password.")
        if username in seen:
            raise SystemExit(f"Duplicate username in users payload: {username}")
        seen.add(username)
        normalized.append({"username": username, "password": password})

    if not normalized:
        raise SystemExit("Users payload is empty.")

    return normalized


def load_users() -> list[dict[str, str]]:
    if AUTH_USERS_FILE:
        raw_users = json.loads(Path(AUTH_USERS_FILE).read_text(encoding="utf-8"))
        return normalize_users(raw_users)

    if AUTH_USERS_JSON:
        raw_users = json.loads(AUTH_USERS_JSON)
        return normalize_users(raw_users)

    if AUTH_USER and AUTH_PASSWORD:
        return [{"username": AUTH_USER, "password": AUTH_PASSWORD}]

    raise SystemExit(
        "Set TILDA_DASHBOARD_USERS_FILE / TILDA_DASHBOARD_USERS_JSON or TILDA_DASHBOARD_USER + TILDA_DASHBOARD_PASSWORD before building protected payloads."
    )


def build_user_auth_entry(username: str, password: str) -> dict[str, object]:
    salt = secrets.token_bytes(16)
    auth_hash = derive_key(f"{username}:{password}", salt, AUTH_ITERATIONS)
    return {
        "username": username,
        "auth": {
            "iterations": AUTH_ITERATIONS,
            "salt": b64(salt),
            "hash": b64(auth_hash),
        },
    }


def extract_legacy_auth_config() -> dict[str, object] | None:
    existing = parse_existing_js_assignment(ROOT / "auth-config.js", "window.TILDA_AUTH_CONFIG = ")
    if not existing:
        return None
    username = existing.get("username")
    auth = existing.get("auth")
    if isinstance(username, str) and isinstance(auth, dict):
        return {"username": username, "auth": auth}
    return None


def build_auth_config(users: list[dict[str, str]]) -> str:
    payload: dict[str, object] = {
        "users": [build_user_auth_entry(user["username"], user["password"]) for user in users],
    }
    legacy = extract_legacy_auth_config()
    if legacy and legacy["username"] not in {user["username"] for user in users}:
        payload["username"] = legacy["username"]
        payload["auth"] = legacy["auth"]
    return "window.TILDA_AUTH_CONFIG = " + json.dumps(payload, ensure_ascii=False, indent=2) + ";\n"


def extract_legacy_payload(existing_payload: dict[str, object] | None) -> dict[str, object] | None:
    if not existing_payload:
        return None

    if all(key in existing_payload for key in ("cipher", "kdf", "iv", "ciphertext")):
        return {
            "version": existing_payload.get("version", 1),
            "cipher": existing_payload["cipher"],
            "kdf": existing_payload["kdf"],
            "iv": existing_payload["iv"],
            "ciphertext": existing_payload["ciphertext"],
        }

    legacy = existing_payload.get("legacy")
    if isinstance(legacy, dict) and all(key in legacy for key in ("cipher", "kdf", "iv", "ciphertext")):
        return legacy

    return None


def encrypt_payload(
    raw_bytes: bytes,
    users: list[dict[str, str]],
    existing_payload: dict[str, object] | None = None,
) -> dict[str, object]:
    content_key = AESGCM.generate_key(bit_length=256)
    content_iv = secrets.token_bytes(12)
    ciphertext = AESGCM(content_key).encrypt(content_iv, raw_bytes, None)

    wrapped_keys: dict[str, dict[str, object]] = {}
    for user in users:
        salt = secrets.token_bytes(16)
        wrap_iv = secrets.token_bytes(12)
        password_key = derive_key(user["password"], salt, PAYLOAD_ITERATIONS)
        wrapped_key = AESGCM(password_key).encrypt(wrap_iv, content_key, None)
        wrapped_keys[user["username"]] = {
            "cipher": "AES-GCM",
            "kdf": {
                "name": "PBKDF2-HMAC-SHA256",
                "iterations": PAYLOAD_ITERATIONS,
                "salt": b64(salt),
            },
            "iv": b64(wrap_iv),
            "ciphertext": b64(wrapped_key),
        }

    payload: dict[str, object] = {
        "version": 2,
        "cipher": "AES-GCM",
        "iv": b64(content_iv),
        "ciphertext": b64(ciphertext),
        "wrappedKeys": wrapped_keys,
    }

    legacy = extract_legacy_payload(existing_payload)
    if legacy:
        payload["legacy"] = legacy

    return payload


def main() -> None:
    users = load_users()

    for name, source_candidates, target_path in SOURCES:
        source_path = next((path for path in source_candidates if path.exists()), None)
        if source_path is None:
            raise SystemExit(f"Missing raw dataset for {name}. Expected one of: {', '.join(str(path) for path in source_candidates)}")

        raw_bytes = source_path.read_bytes()
        encrypted = encrypt_payload(raw_bytes, users, parse_existing_payload(target_path))
        target_path.write_text(json.dumps(encrypted, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    (ROOT / "auth-config.js").write_text(
        build_auth_config(users),
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
