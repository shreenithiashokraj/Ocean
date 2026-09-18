import { NextResponse } from "next/server";
import { clearCookie, getSession, revokeSession } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST() {
  const session = await getSession();
  if (session) await revokeSession(session.sid);
  const res = NextResponse.json({ ok: true });
  res.headers.set("Set-Cookie", clearCookie());
  return res;
}
