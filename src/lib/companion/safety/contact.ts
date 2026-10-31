import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import type { EmergencyContactView } from "./crisis";

// Emergency contacts are stored encrypted at rest (AES-256-GCM) and are only
// decrypted to build the crisis view. They never enter model context, and the
// app never contacts them.

export function parseContactKey(base64Key: string | undefined): Buffer {
  const key = Buffer.from(base64Key ?? "", "base64");
  if (key.length !== 32) {
    throw new Error("CONTACT_ENCRYPTION_KEY must be 32 bytes, base64 encoded.");
  }
  return key;
}

export function encryptContact(contact: EmergencyContactView, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(contact), "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), body.toString("base64")].join(".");
}

export function decryptContact(sealed: string, key: Buffer): EmergencyContactView {
  const [version, iv, tag, body] = sealed.split(".");
  if (version !== "v1" || !iv || !tag || !body) throw new Error("Unsupported contact format.");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  const json = Buffer.concat([decipher.update(Buffer.from(body, "base64")), decipher.final()]).toString("utf8");
  return JSON.parse(json) as EmergencyContactView;
}

export function normalizeContact(input: Partial<EmergencyContactView>): EmergencyContactView | null {
  const clean = (value: string | null | undefined, max: number) => value?.trim().slice(0, max) || null;
  const contact = {
    name: clean(input.name, 80),
    relationship: clean(input.relationship, 60),
    phoneOrEmail: clean(input.phoneOrEmail, 120),
  };
  return contact.name || contact.relationship || contact.phoneOrEmail ? contact : null;
}

export interface EmergencyContactRepository {
  save(userId: string, contact: EmergencyContactView | null): Promise<void>;
  /** Only the crisis view may call this. */
  getForCrisisView(userId: string): Promise<EmergencyContactView | null>;
  deleteAllForUser(userId: string): Promise<void>;
}

export class InMemoryEmergencyContactRepository implements EmergencyContactRepository {
  /** Ciphertext only, as it would be stored in the database. */
  readonly sealed = new Map<string, string>();

  constructor(private readonly key: Buffer) {}

  async save(userId: string, contact: EmergencyContactView | null) {
    if (contact) this.sealed.set(userId, encryptContact(contact, this.key));
    else this.sealed.delete(userId);
  }

  async getForCrisisView(userId: string) {
    const sealed = this.sealed.get(userId);
    return sealed ? decryptContact(sealed, this.key) : null;
  }

  async deleteAllForUser(userId: string) {
    this.sealed.delete(userId);
  }
}
