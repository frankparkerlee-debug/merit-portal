// Background photo-stage endpoint.
//
// The Shopify intake form uploads the patient's ID photo to this endpoint
// AS SOON AS THE FILE IS PICKED on step 3 — not on form submission. By the
// time the patient clicks "Submit," the photo is already on the portal's
// persistent disk. The final submission only POSTs metadata (small, fast)
// and references the staged photo by submissionRef.
//
// Files land under /var/data/intake-uploads/_staging/<submissionRef>/<uuid>.<ext>
// (separate from /var/data/intake-uploads/<intakeId>/ which the final
// submission moves them to). A nightly cleanup job will sweep staged
// photos older than 24h that never got claimed by an intake row.
//
// CORS: same as /api/intake — only the storefront origins. No auth needed
// by design — the patient is unauthenticated. Abuse mitigations: 8MB
// file-size cap, mimetype validation, rate limit at the Render layer.

import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROOT = process.env.INTAKE_UPLOADS_DIR ?? "/var/data/intake-uploads";
const STAGING_ROOT = path.join(ROOT, "_staging");
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/heic",
  "image/heif",
  "image/webp",
  "application/pdf",
]);

const ALLOWED_ORIGINS = new Set([
  "https://meritsciences.com",
  "https://www.meritsciences.com",
  "https://meritpeptides.myshopify.com",
]);

function corsHeaders(req: NextRequest): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  const allowed = ALLOWED_ORIGINS.has(origin) ? origin : "https://meritsciences.com";
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req) });
}

// Sanitize a submissionRef to defang path-traversal. Real client refs are
// RX-XXXXXX (uppercase alnum, prefix RX-); enforce that pattern strictly.
function safeRef(raw: string | null): string | null {
  if (!raw) return null;
  return /^RX-[A-Z0-9]{6,16}$/.test(raw) ? raw : null;
}

function extFromMime(mime: string): string {
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
      return ".bin";
  }
}

export async function POST(req: NextRequest) {
  const cors = corsHeaders(req);
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400, headers: cors });
  }
  const ref = safeRef((form.get("submission_ref") as string | null) ?? null);
  if (!ref) return NextResponse.json({ error: "invalid_ref" }, { status: 400, headers: cors });

  const photoEntry = form.get("id_photo");
  if (!(photoEntry instanceof File) || photoEntry.size === 0) {
    return NextResponse.json({ error: "no_photo" }, { status: 400, headers: cors });
  }
  if (photoEntry.size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: "file_too_large" }, { status: 413, headers: cors });
  }
  if (photoEntry.type && !ALLOWED_MIME.has(photoEntry.type)) {
    return NextResponse.json({ error: "unsupported_type" }, { status: 415, headers: cors });
  }

  const subdir = path.join(STAGING_ROOT, ref);
  await fs.mkdir(subdir, { recursive: true });
  const uuid = crypto.randomUUID();
  const ext = extFromMime(photoEntry.type || "");
  const filename = `id-photo-${uuid}${ext}`;
  const fullPath = path.join(subdir, filename);
  const stagedKey = `_staging/${ref}/${filename}`;

  const buf = Buffer.from(await photoEntry.arrayBuffer());
  await fs.writeFile(fullPath, buf, { mode: 0o600 });

  return NextResponse.json(
    { ok: true, stagedKey, size: buf.length },
    { status: 201, headers: cors },
  );
}
