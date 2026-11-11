import { mkdir, readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

const imageDirectory = fileURLToPath(new URL("../uploads/fundraising-profiles", import.meta.url));
const imageTypes = {
  "image/jpeg": { extension: "jpg", signature: [0xff, 0xd8, 0xff] },
  "image/png": { extension: "png", signature: [0x89, 0x50, 0x4e, 0x47] },
  "image/webp": { extension: "webp", signature: [0x52, 0x49, 0x46, 0x46] },
} as const;

let r2Storage:
  | { client: S3Client; bucket: string }
  | null
  | undefined;

function getR2Storage() {
  if (r2Storage !== undefined) return r2Storage;
  const accountId = process.env.R2_ACCOUNT_ID?.trim();
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();
  const bucket = process.env.R2_BUCKET?.trim();
  if (!accountId && !accessKeyId && !secretAccessKey && !bucket) {
    r2Storage = null;
    return r2Storage;
  }
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket)
    throw new Error(
      "R2 image storage configuration is incomplete. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and R2_BUCKET.",
    );
  r2Storage = {
    client: new S3Client({
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      region: "auto",
      credentials: { accessKeyId, secretAccessKey },
    }),
    bucket,
  };
  return r2Storage;
}

export function profileImageStorageMode() {
  return getR2Storage() ? "R2" : "local filesystem";
}

export class ProfileImageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProfileImageError";
  }
}

async function readLocalProfileImage(filename: string, contentType: string) {
  try {
    return {
      image: await readFile(path.join(imageDirectory, filename)),
      contentType,
    };
  } catch (cause) {
    if (cause instanceof Error && "code" in cause && cause.code === "ENOENT")
      return undefined;
    throw cause;
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
  const storage = getR2Storage();
  if (storage) {
    await storage.client.send(
      new PutObjectCommand({
        Bucket: storage.bucket,
        Key: `fundraising-profiles/${filename}`,
        Body: image,
        ContentType: contentType,
      }),
    );
  } else {
    await mkdir(imageDirectory, { recursive: true });
    await writeFile(path.join(imageDirectory, filename), image, { flag: "wx" });
  }
  return `/api/fundraising-profiles/images/${filename}`;
}

export async function readProfileImage(filename: string) {
  if (!/^[\da-f-]+\.(?:jpg|png|webp)$/i.test(filename)) return undefined;
  const extension = path.extname(filename);
  const contentType = extension === ".jpg" ? "image/jpeg" : extension === ".png" ? "image/png" : "image/webp";
  const storage = getR2Storage();
  if (storage) {
    try {
      const result = await storage.client.send(
        new GetObjectCommand({
          Bucket: storage.bucket,
          Key: `fundraising-profiles/${filename}`,
        }),
      );
      if (!result.Body) throw new Error("R2 returned an empty image body.");
      return {
        image: Buffer.from(await result.Body.transformToByteArray()),
        contentType: result.ContentType || contentType,
      };
    } catch (cause) {
      if (
        cause instanceof Error &&
        (cause.name === "NoSuchKey" ||
          ("$metadata" in cause &&
            typeof cause.$metadata === "object" &&
            cause.$metadata !== null &&
            "httpStatusCode" in cause.$metadata &&
            cause.$metadata.httpStatusCode === 404))
      )
        return readLocalProfileImage(filename, contentType);
      throw cause;
    }
  }
  return readLocalProfileImage(filename, contentType);
}
