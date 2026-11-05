import { mkdir, readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";

const imageDirectory = fileURLToPath(new URL("../uploads/fundraising-profiles", import.meta.url));
const imageTypes = {
  "image/jpeg": { extension: "jpg", signature: [0xff, 0xd8, 0xff] },
  "image/png": { extension: "png", signature: [0x89, 0x50, 0x4e, 0x47] },
  "image/webp": { extension: "webp", signature: [0x52, 0x49, 0x46, 0x46] },
} as const;

export class ProfileImageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProfileImageError";
  }
}

export async function saveProfileImage(dataUrl: unknown) {
  if (typeof dataUrl !== "string") {
    throw new ProfileImageError("Image data is invalid.");
  }

  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl);
  if (!match) {
    throw new ProfileImageError("Use a JPEG, PNG, or WebP image.");
  }

  const [, contentType, encoded] = match;
  const type = imageTypes[contentType as keyof typeof imageTypes];
  const image = Buffer.from(encoded, "base64");
  if (image.length === 0 || image.length > 5 * 1024 * 1024) {
    throw new ProfileImageError("Images must be smaller than 5 MB.");
  }
  if (!type.signature.every((byte, index) => image[index] === byte)) {
    throw new ProfileImageError("The uploaded image file is invalid.");
  }

  const filename = `${randomUUID()}.${type.extension}`;
  await mkdir(imageDirectory, { recursive: true });
  await writeFile(path.join(imageDirectory, filename), image, { flag: "wx" });
  return `/api/fundraising-profiles/images/${filename}`;
}

export async function readProfileImage(filename: string) {
  if (!/^[\da-f-]+\.(?:jpg|png|webp)$/i.test(filename)) return undefined;
  const image = await readFile(path.join(imageDirectory, filename));
  const extension = path.extname(filename);
  const contentType = extension === ".jpg" ? "image/jpeg" : extension === ".png" ? "image/png" : "image/webp";
  return { image, contentType };
}
