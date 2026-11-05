import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import type { DarajaCredentials } from "./daraja-client";

function encryptionKey() {
  const configured = process.env.MPESA_CREDENTIALS_ENCRYPTION_KEY;
  if (!configured || !/^[a-f\d]{64}$/i.test(configured))
    throw new Error(
      "Payment credential encryption is not configured on the server.",
    );
  return Buffer.from(configured, "hex");
}

export function encryptSecretPayload(payload: unknown) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(payload), "utf8"),
    cipher.final(),
  ]);
  return [iv, cipher.getAuthTag(), ciphertext]
    .map((part) => part.toString("base64"))
    .join(".");
}

export function decryptSecretPayload<T>(encrypted: string): T {
  const [iv, authTag, ciphertext] = encrypted
    .split(".")
    .map((part) => Buffer.from(part, "base64"));
  if (!iv || !authTag || !ciphertext)
    throw new Error(
      "Saved payment credentials have an invalid encrypted format.",
    );
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString("utf8");
  return JSON.parse(plaintext) as T;
}

export function encryptDarajaCredentials(credentials: DarajaCredentials) {
  return encryptSecretPayload(credentials);
}

export function decryptDarajaCredentials(encrypted: string): DarajaCredentials {
  return decryptSecretPayload<DarajaCredentials>(encrypted);
}

export function createMpesaEncryptionKey() {
  return randomBytes(32).toString("hex");
}
