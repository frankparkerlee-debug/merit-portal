// Persistent storage for intake-uploaded files (ID photos, lab PDFs).
//
// Files live on a Render persistent disk mounted at /var/data. The disk
// survives redeploys and restarts. We never store PHI in Shopify; we never
// commit files to git. The DB only stores the relative filesystem key —
// the file bytes live on the disk and are streamed back on demand through
// an authenticated route that role-checks the requester.

import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";

const ROOT = process.env.INTAKE_UPLOADS_DIR ?? "/var/data/intake-uploads";

export type StoredFile = {
  key: string; // relative path stored in Intake.idPhotoKey / labResultsKey
  size: number;
  mimeType: string;
};

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

/**
 * Save an uploaded file under /var/data/intake-uploads/<intakeId>/<uuid>.<ext>.
 * Returns the relative key that should be persisted on the Intake row.
 */
export async function saveIntakeFile(
  intakeId: string,
  file: File,
  kind: "id-photo" | "lab-results",
): Promise<StoredFile> {
  if (!file || file.size === 0) {
    throw new Error("Empty file");
  }
  const extFromName = path.extname(file.name || "").toLowerCase().replace(/[^a-z0-9.]/g, "");
  const ext = extFromName || mimeToExt(file.type) || ".bin";

  const subdir = path.join(ROOT, intakeId);
  await ensureDir(subdir);

  const uuid = crypto.randomUUID();
  const filename = `${kind}-${uuid}${ext}`;
  const fullPath = path.join(subdir, filename);
  const relativeKey = `${intakeId}/${filename}`;

  const buf = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(fullPath, buf, { mode: 0o600 });

  return { key: relativeKey, size: buf.length, mimeType: file.type || "application/octet-stream" };
}

/**
 * Read a file back from disk given its stored key. Throws if the key is not
 * within the uploads root (defends against `../` escape attempts).
 */
export async function readIntakeFile(key: string): Promise<{ data: Buffer; mimeType: string }> {
  const fullPath = path.resolve(ROOT, key);
  if (!fullPath.startsWith(path.resolve(ROOT) + path.sep)) {
    throw new Error("Invalid file key");
  }
  const data = await fs.readFile(fullPath);
  const ext = path.extname(fullPath).toLowerCase();
  return { data, mimeType: extToMime(ext) };
}

function mimeToExt(mime: string): string | null {
  switch (mime) {
    case "image/jpeg":
    case "image/jpg":
      return ".jpg";
    case "image/png":
      return ".png";
    case "image/heic":
      return ".heic";
    case "image/heif":
      return ".heif";
    case "image/webp":
      return ".webp";
    case "application/pdf":
      return ".pdf";
    default:
      return null;
  }
}

function extToMime(ext: string): string {
  switch (ext) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    case ".heic":
      return "image/heic";
    case ".heif":
      return "image/heif";
    case ".webp":
      return "image/webp";
    case ".pdf":
      return "application/pdf";
    default:
      return "application/octet-stream";
  }
}
