import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import { config } from "../config";

function key(): Buffer {
  const k = Buffer.from(config().ENCRYPTION_KEY, "base64");
  if (k.length !== 32) throw new Error("ENCRYPTION_KEY must be 32 bytes, base64-encoded");
  return k;
}

/** AES-256-GCM, stored as base64(nonce[12] ‖ ciphertext ‖ tag[16]). */
export function encryptToken(plain: string): string {
  const nonce = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), nonce);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return Buffer.concat([nonce, enc, c.getAuthTag()]).toString("base64");
}

export function decryptToken(stored: string): string {
  const buf = Buffer.from(stored, "base64");
  const d = createDecipheriv("aes-256-gcm", key(), buf.subarray(0, 12));
  d.setAuthTag(buf.subarray(buf.length - 16));
  return Buffer.concat([d.update(buf.subarray(12, buf.length - 16)), d.final()]).toString("utf8");
}

export function buyerHash(userId: string): string {
  return createHash("sha256").update(userId + config().PII_SALT).digest("hex").slice(0, 32);
}
