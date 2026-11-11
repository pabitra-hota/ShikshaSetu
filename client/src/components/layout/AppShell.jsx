import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/components/providers/AppProviders";
import Navbar from "./Navbar";
import Sidebar from "./Sidebar";
import MobileNav from "./MobileNav";
import { offlineService } from "@/lib/offline/service";
export default function AppShell({
  children
}) {
  const { user, setUser } = useAuth();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const previousUserId = useRef(user?.id);
  const teacherBlockedRoute = user?.role === "TEACHER" && ["/teachers", "/settings"].some((path) => pathname === path || pathname.startsWith(`${path}/`));

  useEffect(() => {
    if (previousUserId.current !== user?.id) {
      queryClient.clear();
      previousUserId.current = user?.id;
    }
  }, [queryClient, user?.id]);

  useEffect(() => {
    if (teacherBlockedRoute) navigate("/attendance", { replace: true });
  }, [navigate, teacherBlockedRoute]);

  useEffect(() => {
    // 1. Fetch current user session
    let cancelled = false;
    (async () => {
      const cachedUser = localStorage.getItem("shikshasetu_user");
      try {
        const res = await fetch("/api/auth/me");
        const data = res.ok ? await res.json() : null;
        if (cancelled) return;
        if (data?.authenticated) {
          await offlineService.ensureRosterOwner(data.user.id);
          setUser(data.user);
          localStorage.setItem("shikshasetu_user", JSON.stringify(data.user));
          return;
        }
        throw new Error("Session unavailable");
      } catch {
        if (cancelled) return;
        // May be offline, check localStorage session fallback
        if (cachedUser) {
          try {
            const userData = JSON.parse(cachedUser);
            await offlineService.ensureRosterOwner(userData.id);
            setUser(userData);
          } catch {
            // ignore
          }
        } else {
          navigate("/login", { replace: true });
        }
      }
    })();
    return () => { cancelled = true; };
  }, [setUser, navigate]);

  useEffect(() => {
    if (!user?.id || !navigator.onLine) return;
    let cancelled = false;
    Promise.all([
      fetch("/api/students").then((response) => response.ok ? response.json() : { students: [] }),
      fetch("/api/classes").then((response) => response.ok ? response.json() : { classes: [] }),
    ]).then(([studentData, classData]) => {
      if (cancelled) return;
      const sections = [];
      const classes = (classData.classes || []).map((schoolClass) => {
        sections.push(...(schoolClass.sections || []).map((section) => ({
          id: section.id,
          name: section.name,
          classId: schoolClass.id,
          className: schoolClass.name,
        })));
        return { id: schoolClass.id, name: schoolClass.name, gradeLevel: schoolClass.gradeLevel };
      });
      const students = studentData.students.map((student) => ({
        id: student.id,
        studentId: student.studentId,
        name: student.name,
        rollNumber: student.rollNumber,
        classId: student.classId,
        className: student.className,
        sectionId: student.sectionId,
        sectionName: student.sectionName,
        gender: student.gender,
        guardianName: student.guardianName,
        guardianPhone: student.guardianPhone,
        photoUrl: student.photoUrl,
        descriptor: student.descriptor,
        status: student.status,
        updatedAt: new Date().toISOString(),
      }));
      return offlineService.cacheRoster(students, classes, sections, user.id);
    }).catch((error) => {
      console.warn("Could not refresh offline roster:", error);
    });
    return () => { cancelled = true; };
  }, [user?.id]);
  return <div className="app-shell min-h-screen flex flex-col pb-16 lg:pb-0"><Navbar user={user}></Navbar><div className="app-layout flex-1 flex max-w-7xl w-full mx-auto"><Sidebar userRole={user?.role}></Sidebar><main className="app-main flex-1 p-4 sm:p-6 lg:p-8 min-w-0 overflow-y-auto">{teacherBlockedRoute ? <p className="state-message" role="status">Principal access is required for this screen. Returning you to attendance…</p> : children}</main></div><MobileNav></MobileNav></div>;
}
