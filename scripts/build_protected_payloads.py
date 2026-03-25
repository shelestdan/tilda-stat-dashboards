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


def encrypt_payload(raw_bytes: bytes, password: str) -> dict[str, object]:
    salt = secrets.token_bytes(16)
    iv = secrets.token_bytes(12)
    key = derive_key(password, salt, PAYLOAD_ITERATIONS)
    ciphertext = AESGCM(key).encrypt(iv, raw_bytes, None)
    return {
        "version": 1,
        "cipher": "AES-GCM",
        "kdf": {
            "name": "PBKDF2-HMAC-SHA256",
            "iterations": PAYLOAD_ITERATIONS,
            "salt": b64(salt),
        },
        "iv": b64(iv),
        "ciphertext": b64(ciphertext),
    }


def build_auth_config(username: str, password: str) -> str:
    salt = secrets.token_bytes(16)
    auth_hash = derive_key(f"{username}:{password}", salt, AUTH_ITERATIONS)
    payload = {
        "username": username,
        "auth": {
            "iterations": AUTH_ITERATIONS,
            "salt": b64(salt),
            "hash": b64(auth_hash),
        },
    }
    return "window.TILDA_AUTH_CONFIG = " + json.dumps(payload, ensure_ascii=False, indent=2) + ";\n"


def main() -> None:
    if not AUTH_USER or not AUTH_PASSWORD:
        raise SystemExit(
            "Set TILDA_DASHBOARD_USER and TILDA_DASHBOARD_PASSWORD before building protected payloads."
        )

    for name, source_candidates, target_path in SOURCES:
        source_path = next((path for path in source_candidates if path.exists()), None)
        if source_path is None:
            raise SystemExit(f"Missing raw dataset for {name}. Expected one of: {', '.join(str(path) for path in source_candidates)}")

        raw_bytes = source_path.read_bytes()
        encrypted = encrypt_payload(raw_bytes, AUTH_PASSWORD)
        target_path.write_text(json.dumps(encrypted, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    (ROOT / "auth-config.js").write_text(
        build_auth_config(AUTH_USER, AUTH_PASSWORD),
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
