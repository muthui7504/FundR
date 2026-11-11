import assert from "node:assert/strict";
import { unlink } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

test("profile images remain readable from local storage when R2 is not configured", async () => {
  const r2Keys = [
    "R2_ACCOUNT_ID",
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
    "R2_BUCKET",
  ] as const;
  const previousValues = r2Keys.map((key) => process.env[key]);
  for (const key of r2Keys) delete process.env[key];
  const { readProfileImage, saveProfileImage } = await import("./profile-image-storage");
  let savedPath: string | undefined;

  try {
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const imageUrl = await saveProfileImage(
      `data:image/png;base64,${bytes.toString("base64")}`,
    );
    savedPath = path.join(
      fileURLToPath(new URL("../uploads/fundraising-profiles/", import.meta.url)),
      imageUrl.slice(imageUrl.lastIndexOf("/") + 1),
    );

    const stored = await readProfileImage(imageUrl.slice(imageUrl.lastIndexOf("/") + 1));
    assert.ok(stored);
    assert.equal(stored.contentType, "image/png");
    assert.deepEqual(stored.image, bytes);
  } finally {
    if (savedPath) await unlink(savedPath);
    r2Keys.forEach((key, index) => {
      const value = previousValues[index];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    });
  }
});
