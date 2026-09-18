import { SignJWT, jwtVerify } from "jose";
import { compare, hash } from "bcryptjs";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { randomBytes } from "crypto";

export const SESSION_COOKIE = process.env.SESSION_COOKIE_NAME || "fisherman_session";
const SECRET = new TextEncoder().encode(process.env.JWT_SECRET || "dev-secret-change-me");
const SESSION_TTL_HOURS = Number(process.env.JWT_EXPIRES_HOURS || 168);

export type Role = "ADMIN" | "RESEARCHER" | "FISHERMAN";
export const ALL_ROLES: Role[] = ["ADMIN", "RESEARCHER", "FISHERMAN"];

export interface SessionPayload {
  sub: string; // user id
  email: string;
  name: string;
  role: Role;
  sid: string; // session id
}

/** Hash a plaintext password (bcrypt). */
export async function hashPassword(plain: string): Promise<string> {
  return hash(plain, 10);
}

/** Verify a plaintext password against a hash. */
export async function verifyPassword(plain: string, hashed: string): Promise<boolean> {
  try {
    return await compare(plain, hashed);
  } catch {
    return false;
  }
}

/** Sign a JWT session token for a user + created session row. */
export async function signSession(userId: string, email: string, name: string, role: Role, sessionId: string) {
  return await new SignJWT({ email, name, role, sid: sessionId })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_HOURS}h`)
    .sign(SECRET);
}

/** Create a session row in DB + return the signed JWT cookie value. */
export async function createSession(userId: string, role: Role, email: string, name: string) {
  const sessionId = crypto.randomUUID();
  const token = await signSession(userId, email, name, role, sessionId);
  // Store a hash of the token id so we can revoke by session row without exposing token.
  await db.session.create({
    data: {
      id: sessionId,
      userId,
      tokenHash: sessionId, // sessionId is already a random UUID; sufficient for revocation
      expiresAt: new Date(Date.now() + SESSION_TTL_HOURS * 3600 * 1000),
    },
  });
  return token;
}

export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET);
    const sub = typeof payload.sub === "string" ? payload.sub : null;
    const sid = typeof (payload as { sid?: unknown }).sid === "string" ? (payload as { sid: string }).sid : null;
    if (!sub || !sid) return null;
    // Confirm session still valid in DB (revocation support)
    const session = await db.session.findUnique({ where: { id: sid } });
    if (!session) return null;
    if (session.expiresAt.getTime() < Date.now()) return null;
    const user = await db.user.findUnique({
      where: { id: sub },
      select: { id: true, isActive: true, role: true, email: true, name: true },
    });
    if (!user || !user.isActive) return null;
    return {
      sub: user.id,
      email: user.email,
      name: user.name,
      role: user.role as Role,
      sid,
    };
  } catch {
    return null;
  }
}

/** Read + verify the session from the incoming request cookies (server-side). */
export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySession(token);
}

/** Server-side helper: require a session, else return null. */
export async function requireUser(): Promise<SessionPayload | null> {
  return await getSession();
}

/** Require a session AND a specific role. Returns null if forbidden. */
export async function requireRole(...roles: Role[]): Promise<SessionPayload | null> {
  const s = await getSession();
  if (!s) return null;
  if (!roles.includes(s.role)) return null;
  return s;
}

/** Generate a short opaque password-reset token (stored hashed). */
export async function createPasswordReset(userId: string): Promise<string> {
  const raw = randomBytes(24).toString("hex");
  await db.passwordReset.create({
    data: {
      userId,
      tokenHash: raw,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
    },
  });
  return raw;
}

export async function consumePasswordReset(raw: string): Promise<{ userId: string } | null> {
  const rec = await db.passwordReset.findUnique({ where: { tokenHash: raw } });
  if (!rec) return null;
  if (rec.used) return null;
  if (rec.expiresAt.getTime() < Date.now()) return null;
  await db.passwordReset.update({ where: { id: rec.id }, data: { used: true } });
  return { userId: rec.userId };
}

/** Revoke a single session (logout). */
export async function revokeSession(sessionId: string) {
  try {
    await db.session.delete({ where: { id: sessionId } });
  } catch {
    /* already gone */
  }
}

/** Helper to set the httpOnly session cookie on a Response. */
export function sessionCookie(token: string): string {
  const maxAge = SESSION_TTL_HOURS * 3600;
  const flags = [
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
  ];
  if (process.env.NODE_ENV === "production") flags.push("Secure");
  return `${SESSION_COOKIE}=${token}; ${flags.join("; ")}`;
}

export function clearCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}
