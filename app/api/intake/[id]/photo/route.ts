// Stream an intake's ID photo back to the requester.
//
// Auth: PHYSICIAN, OPS, and PHARMACY can all view ID photos for any intake
// (need to verify identity at multiple stages). The session check is
// enforced *here* rather than relying on middleware so we can return 404
// instead of redirecting on auth failure — this route is consumed as an
// <img src> and a redirect would render as a broken image with no diagnostic.

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { readIntakeFile } from "@/lib/intake-storage";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (!session?.user || !["PHYSICIAN", "PHARMACY", "OPS"].includes(role ?? "")) {
    return new NextResponse("not found", { status: 404 });
  }

  const { id } = await ctx.params;
  const intake = await prisma.intake.findUnique({
    where: { id },
    select: { idPhotoKey: true },
  });
  if (!intake?.idPhotoKey) {
    return new NextResponse("not found", { status: 404 });
  }

  try {
    const { data, mimeType } = await readIntakeFile(intake.idPhotoKey);
    return new NextResponse(new Uint8Array(data), {
      status: 200,
      headers: {
        "Content-Type": mimeType,
        "Content-Length": data.length.toString(),
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    console.error("[intake/photo] read failed:", err);
    return new NextResponse("not found", { status: 404 });
  }
}
