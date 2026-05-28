// Public intake submission endpoint.
//
// POSTed to by the Shopify intake form (meritsciences.com/pages/intake)
// as multipart/form-data. Creates an Intake row in Postgres with
// status=SUBMITTED, saves the ID photo to the persistent disk, returns
// the human-readable submissionRef so the form can append it as a cart
// attribute for the subsequent Shopify checkout.
//
// CORS: the storefront and portal are on different origins, so we set
// permissive CORS headers. The endpoint is unauthenticated *by design* —
// it's the very start of a customer's intake journey, before they have a
// Shopify customer record. We mitigate abuse with:
//   • rate limiting at the Render/CDN layer (separate)
//   • per-submission file-size cap (8MB)
//   • strict zod validation on every field
//   • the Shopify webhook later confirms a real paid order references the
//     submissionRef before any physician sees the intake

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { promises as fs } from "fs";
import path from "path";
import { prisma } from "@/lib/db";
import { saveIntakeFile } from "@/lib/intake-storage";
import { newSubmissionRef } from "@/lib/intake-ref";

const UPLOADS_ROOT = process.env.INTAKE_UPLOADS_DIR ?? "/var/data/intake-uploads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FILE_BYTES = 8 * 1024 * 1024;

const intakeSchema = z.object({
  // Client-generated submission ref (optional — server falls back to its own).
  // When present, it must match the staging-endpoint's strict ref pattern.
  submission_ref: z.string().regex(/^RX-[A-Z0-9]{6,16}$/).optional(),
  // Compound
  compound: z.enum(["tirzepatide", "retatrutide", "tesamorelin"]),
  // Patient identity
  full_name: z.string().min(2).max(120),
  email: z.string().email().max(160),
  phone: z.string().min(7).max(40),
  dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "DOB must be YYYY-MM-DD"),
  state: z.string().length(2),
  // Body metrics
  height_ft: z.coerce.number().int().min(3).max(8),
  height_in: z.coerce.number().int().min(0).max(11),
  weight: z.coerce.number().int().min(50).max(1000),
  // Health screen (yes/no)
  pregnant: z.enum(["yes", "no"]),
  mtc: z.enum(["yes", "no"]),
  pancreatitis: z.enum(["yes", "no"]),
  current_incretin: z.enum(["yes", "no"]),
  incretin_allergy: z.enum(["yes", "no"]),
  eating_disorder: z.enum(["yes", "no"]),
  diabetes_meds: z.enum(["yes", "no"]),
  // Allergies + notes
  allergies: z.enum(["yes", "no"]),
  allergies_details: z.string().max(2000).optional().default(""),
  additional_notes: z.string().max(4000).optional().default(""),
  // Routing (form-supplied — server re-derives to make sure it matches)
  routing_path: z.enum(["A", "B", "C"]).optional(),
  routing_reason: z.string().max(120).optional(),
});

function yn(v: "yes" | "no"): boolean {
  return v === "yes";
}

function compoundEnum(c: z.infer<typeof intakeSchema>["compound"]) {
  switch (c) {
    case "tirzepatide":
      return "TIRZEPATIDE" as const;
    case "retatrutide":
      return "RETATRUTIDE" as const;
    case "tesamorelin":
      return "TESAMORELIN" as const;
  }
}

// CORS: allow the storefront origin only. Add the staging Shopify URL too in
// case we ever preview from there.
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

export async function POST(req: NextRequest) {
  const cors = corsHeaders(req);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400, headers: cors });
  }

  // Pull non-file fields into a plain object for zod
  const fields: Record<string, string> = {};
  for (const [k, v] of form.entries()) {
    if (typeof v === "string") fields[k] = v;
  }

  const parsed = intakeSchema.safeParse(fields);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_failed", issues: parsed.error.issues },
      { status: 400, headers: cors },
    );
  }
  const data = parsed.data;

  const photoEntry = form.get("id_photo");
  const photo = photoEntry instanceof File && photoEntry.size > 0 ? photoEntry : null;
  if (photo && photo.size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: "file_too_large" }, { status: 413, headers: cors });
  }

  // Submission ref: client-supplied if present (the background-upload flow
  // generates it on page-load so it can pre-stage the photo before submit),
  // otherwise fall back to a server-generated one.
  const submissionRef = data.submission_ref ?? newSubmissionRef();
  const totalInches = data.height_ft * 12 + data.height_in;
  const intake = await prisma.intake.create({
    data: {
      submissionRef,
      status: "SUBMITTED",
      compound: compoundEnum(data.compound),
      patientFirstName: data.full_name.split(" ")[0] ?? data.full_name,
      patientLastName: data.full_name.split(" ").slice(1).join(" ") || "",
      patientEmail: data.email.toLowerCase(),
      patientPhone: data.phone,
      patientDob: new Date(data.dob + "T00:00:00Z"),
      patientState: data.state.toUpperCase(),
      heightInches: totalInches,
      weightLbs: data.weight,
      screenPregnant: yn(data.pregnant),
      screenMtcMen2: yn(data.mtc),
      screenPancreatitis: yn(data.pancreatitis),
      screenCurrentIncretin: yn(data.current_incretin),
      screenIncretinAllergy: yn(data.incretin_allergy),
      screenEatingDisorder: yn(data.eating_disorder),
      screenDiabetesMeds: yn(data.diabetes_meds),
      hasAllergies: yn(data.allergies),
      allergiesDetails: data.allergies_details || null,
      additionalNotes: data.additional_notes || null,
      routingPath: data.routing_path ?? "A",
      routingReason: data.routing_reason || null,
    },
  });

  // Resolve the ID photo. Two paths:
  //  1. Pre-staged (background-upload flow): the photo was uploaded via
  //     /api/intake/photo-stage when the patient picked the file. We look
  //     for the staged file by submissionRef and move it into the intake's
  //     own directory.
  //  2. Inline (legacy flow): the photo arrived in the same multipart POST.
  //     We save it directly.
  let finalPhotoKey: string | null = null;
  const stagedDir = path.join(UPLOADS_ROOT, "_staging", submissionRef);
  try {
    const stagedFiles = await fs.readdir(stagedDir).catch(() => [] as string[]);
    const stagedPhoto = stagedFiles.find((f) => f.startsWith("id-photo-"));
    if (stagedPhoto) {
      // Move staged → final
      const targetDir = path.join(UPLOADS_ROOT, intake.id);
      await fs.mkdir(targetDir, { recursive: true });
      const srcPath = path.join(stagedDir, stagedPhoto);
      const destPath = path.join(targetDir, stagedPhoto);
      await fs.rename(srcPath, destPath);
      await fs.rmdir(stagedDir).catch(() => {}); // best-effort cleanup
      finalPhotoKey = `${intake.id}/${stagedPhoto}`;
    } else if (photo) {
      const stored = await saveIntakeFile(intake.id, photo, "id-photo");
      finalPhotoKey = stored.key;
    }
    if (finalPhotoKey) {
      await prisma.intake.update({
        where: { id: intake.id },
        data: { idPhotoKey: finalPhotoKey },
      });
    }
  } catch (err) {
    console.error("[intake] photo resolve failed:", err);
    // Don't fail the whole intake — the row still exists; ops can request
    // a re-upload via the patient communications channel.
  }

  // Audit log
  await prisma.intakeAction
    .create({
      data: {
        intakeId: intake.id,
        action: "INTAKE_CREATED",
        toStatus: "SUBMITTED",
        payload: { source: "shopify-intake-form", hasPhoto: Boolean(photo) },
      },
    })
    .catch((err) => console.warn("[intake] audit log failed:", err));

  return NextResponse.json(
    {
      submissionRef,
      intakeId: intake.id,
      status: "SUBMITTED",
    },
    { status: 201, headers: cors },
  );
}
