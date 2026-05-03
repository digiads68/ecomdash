"""AES-256-GCM token encryption/decryption. Matches NestJS crypto.service."""
import os
import base64
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

_raw_key = os.getenv("ENCRYPTION_KEY", "")
KEY = base64.b64decode(_raw_key) if _raw_key else b"\x00" * 32  # fallback for dev


def decrypt_token(encrypted: str) -> str:
    data = base64.b64decode(encrypted)
    nonce, ciphertext = data[:12], data[12:]
    return AESGCM(KEY).decrypt(nonce, ciphertext, None).decode()


def encrypt_token(plaintext: str) -> str:
    nonce = os.urandom(12)
    ciphertext = AESGCM(KEY).encrypt(nonce, plaintext.encode(), None)
    return base64.b64encode(nonce + ciphertext).decode()
