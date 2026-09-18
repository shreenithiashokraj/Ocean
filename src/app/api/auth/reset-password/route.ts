import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { consumePasswordReset, hashPassword } from "@/lib/auth";

export const runtime = "nodejs";

const PASSWORD_MIN = 8;

export async function POST(req: Request) {
  let body: { token?: unknown; password?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const token = typeof body.token === "string" ? body.token.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!token) {
    return NextResponse.json({ error: "Reset token is missing" }, { status: 422 });
  }
  if (password.length < PASSWORD_MIN) {
    return NextResponse.json({ error: `Password must be at least ${PASSWORD_MIN} characters` }, { status: 422 });
  }

  const reset = await consumePasswordReset(token);
  if (!reset) {
    return NextResponse.json({ error: "Reset link is invalid or has expired" }, { status: 410 });
  }

  const passwordHash = await hashPassword(password);
  await db.user.update({
    where: { id: reset.userId },
    data: { passwordHash },
  });
  // Revoke all existing sessions for that user for safety
  await db.session.deleteMany({ where: { userId: reset.userId } }).catch(() => {});

  return NextResponse.json({ ok: true });
}
