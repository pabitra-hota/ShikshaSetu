import { SignJWT, jwtVerify } from "jose";
import prisma from "./db.js";
import bcrypt from "bcryptjs";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "super-secret-rural-school-jwt-key-change-in-prod-32chars"
);
const COOKIE_NAME = "shikshasetu_session";
const SESSION_DURATION_SECONDS = 60 * 60 * 24 * 7; // 7 days (offline friendly session)

export async function createSessionToken(payload) {
  return await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(JWT_SECRET);
}

export async function verifySessionToken(token) {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload;
  } catch {
    return null;
  }
}

export function getSession(req) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return null;
  return verifySessionToken(token);
}

export async function setSessionCookie(res, session) {
  const token = await createSessionToken(session);
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DURATION_SECONDS * 1000,
  });
}

export function clearSessionCookie(res) {
  res.clearCookie(COOKIE_NAME, { path: "/" });
}

export async function requireAuth(req) {
  const session = await getSession(req);
  if (!session) {
    throw Object.assign(new Error("UNAUTHORIZED"), { status: 401 });
  }
  return session;
}

export async function requireRole(req, allowedRoles) {
  const session = await requireAuth(req);
  if (!allowedRoles.includes(session.role)) {
    throw Object.assign(new Error("FORBIDDEN"), { status: 403 });
  }
  return session;
}

export async function verifyUserCredentials(email, password) {
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase().trim() },
    include: {
      teacherProfile: true,
      school: true,
    },
  });
  if (!user) return null;
  const isValid = await bcrypt.compare(password, user.passwordHash);
  if (!isValid) return null;
  const session = {
    userId: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    schoolId: user.schoolId,
    teacherId: user.teacherProfile?.id,
  };
  return { session, user };
}
