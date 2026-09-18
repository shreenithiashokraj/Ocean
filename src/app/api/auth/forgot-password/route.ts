import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createPasswordReset } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let body: { email?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: "Enter a valid email address" }, { status: 422 });
  }

  const user = await db.user.findUnique({ where: { email } });
  // Always respond generically so we don't leak which emails exist.
  if (!user || !user.isActive) {
    return NextResponse.json({
      message: "If that account exists, a reset link has been generated.",
      resetToken: null as string | null,
    });
  }

  const raw = await createPasswordReset(user.id);
  // In production this would be emailed. In the sandbox demo we return it so the
  // UI can prefill the reset form — clearly labeled as a demo flow.
  return NextResponse.json({
    message: "If that account exists, a reset link has been generated.",
    resetToken: raw,
  });
}
