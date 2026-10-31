import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// DP-1: app-level encryption for text stored in the database. AES-256-GCM with
// the owner's user ID as associated data, so a value copied onto another user's
// row fails to decrypt. The key comes from CONTACT_ENCRYPTION_KEY, held outside
// the database. Losing that key makes stored text unreadable.

const VERSION = "v2";

export function sealText(plaintext: string, key: Buffer, ownerId: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(ownerId, "utf8"));
  const body = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return [VERSION, iv.toString("base64"), cipher.getAuthTag().toString("base64"), body.toString("base64")].join(".");
}

export function openText(sealed: string, key: Buffer, ownerId: string): string {
  const [version, iv, tag, body] = sealed.split(".");
  if (version !== VERSION || !iv || !tag || !body) throw new Error("Unsupported sealed text.");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64"));
  decipher.setAAD(Buffer.from(ownerId, "utf8"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(body, "base64")), decipher.final()]).toString("utf8");
}
