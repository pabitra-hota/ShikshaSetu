import { Router } from "express";
import { verifyUserCredentials, setSessionCookie, clearSessionCookie, getSession } from "../lib/auth.js";
import { loginSchema } from "../lib/validation.js";
import prisma from "../lib/db.js";

const router = Router();

router.post("/login", async (req, res) => {
  try {
    const parseResult = loginSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: "Validation failed", details: parseResult.error.format() });
    }
    const { email, password } = parseResult.data;
    const authResult = await verifyUserCredentials(email, password);
    if (!authResult) {
      return res.status(401).json({ error: "Invalid email or password" });
    }
    await setSessionCookie(res, authResult.session);
    return res.json({
      success: true,
      user: {
        id: authResult.user.id,
        name: authResult.user.name,
        email: authResult.user.email,
        role: authResult.user.role,
        schoolName: authResult.user.school.name,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({ error: "An unexpected server error occurred during login" });
  }
});

router.post("/logout", async (_req, res) => {
  clearSessionCookie(res);
  return res.json({ success: true, message: "Logged out successfully" });
});

router.get("/me", async (req, res) => {
  const session = await getSession(req);
  if (!session) {
    return res.status(401).json({ authenticated: false, user: null });
  }
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    include: {
      school: true,
      teacherProfile: {
        include: {
          assignedClasses: true,
          primarySections: true,
        },
      },
    },
  });
  if (!user) {
    return res.status(401).json({ authenticated: false, user: null });
  }
  return res.json({
    authenticated: true,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      schoolId: user.schoolId,
      schoolName: user.school.name,
      schoolCode: user.school.code,
      teacherId: user.teacherProfile?.id,
      assignedClasses: user.teacherProfile?.assignedClasses ?? [],
    },
  });
});

export default router;
