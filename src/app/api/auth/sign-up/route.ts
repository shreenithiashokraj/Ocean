import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createSession, hashPassword, sessionCookie, ALL_ROLES, type Role } from "@/lib/auth";

export const runtime = "nodejs";

const PASSWORD_MIN = 8;

export async function POST(req: Request) {
  let body: {
    name?: unknown;
    email?: unknown;
    password?: unknown;
    role?: unknown;
    phone?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const role = typeof body.role === "string" ? (body.role as Role) : "FISHERMAN";
  const phone = typeof body.phone === "string" ? body.phone.trim() || undefined : undefined;

  if (!name || name.length < 2) {
    return NextResponse.json({ error: "Please enter your full name" }, { status: 422 });
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: "Enter a valid email address" }, { status: 422 });
  }
  if (password.length < PASSWORD_MIN) {
    return NextResponse.json({ error: `Password must be at least ${PASSWORD_MIN} characters` }, { status: 422 });
  }
  if (!ALL_ROLES.includes(role)) {
    return NextResponse.json({ error: "Invalid role selected" }, { status: 422 });
  }

  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json({ error: "An account with this email already exists" }, { status: 409 });
  }

  const passwordHash = await hashPassword(password);
  const user = await db.user.create({
    data: {
      email,
      name,
      role,
      passwordHash,
      isActive: true,
      profile: { create: { phone } },
    },
  });

  const token = await createSession(user.id, role, user.email, user.name);
  const res = NextResponse.json({
    user: { id: user.id, email: user.email, name: user.name, role },
  });
  res.headers.set("Set-Cookie", sessionCookie(token));
  return res;
}
