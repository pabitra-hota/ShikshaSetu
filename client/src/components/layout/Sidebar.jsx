import { Link } from "react-router-dom";
import { useLocation } from "react-router-dom";
import { BarChart3, BookOpen, Camera, LayoutDashboard, RefreshCw, Settings, ShieldCheck, Users, Wifi, WifiOff } from "lucide-react";
import { useSync } from "@/hooks/useSync";

export default function Sidebar({ userRole }) {
  const { pathname } = useLocation();
  const { isOnline, pendingCount, mounted } = useSync();
  const navItems = [
    { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { name: "AI Attendance", href: "/attendance", icon: Camera },
    { name: "Weekly timetable", href: "/timetable", icon: BookOpen },
    { name: "Students", href: "/students", icon: Users },
    { name: userRole === "ADMIN" ? "Classes & Sections" : "My classes", href: "/classes", icon: BookOpen },
    { name: "Teachers", href: "/teachers", icon: ShieldCheck, adminOnly: true },
    { name: "School settings", href: "/settings", icon: Settings, adminOnly: true },
    { name: "Sync center", href: "/sync", icon: RefreshCw, pendingCount },
    { name: "Reports & analytics", href: "/reports", icon: BarChart3 },
  ];

  return (
    <aside className="app-sidebar sticky top-16 hidden h-[calc(100vh-4rem)] max-h-[calc(100vh-4rem)] w-64 shrink-0 self-start flex-col space-y-6 overflow-y-auto border-r p-4 lg:flex">
      <nav className="flex-1 space-y-1" aria-label="Main navigation">
        <p className="nav-section-label">Classroom operations</p>
        {navItems.map((item) => {
          if (item.adminOnly && userRole !== "ADMIN") return null;
          const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <Link key={item.href} to={item.href} aria-current={isActive ? "page" : undefined} className={`sidebar-link ${isActive ? "sidebar-link--active" : ""}`}>
              <span className="flex min-w-0 items-center gap-3"><Icon size={18} aria-hidden="true" /><span className="truncate">{item.name}</span></span>
              {item.pendingCount > 0 && <span className="pending-badge">{item.pendingCount}</span>}
            </Link>
          );
        })}
      </nav>
      <section className="sidebar-status" aria-live="polite">
        <div className="flex items-center justify-between gap-2">
          <strong className="flex items-center gap-2">{!mounted || isOnline ? <Wifi size={14} aria-hidden="true" /> : <WifiOff size={14} aria-hidden="true" />}Offline status</strong>
          <span className={`connection-label ${!mounted || isOnline ? "is-connected" : "is-disconnected"}`}>{!mounted || isOnline ? "Connected" : "Offline"}</span>
        </div>
        <p>{!mounted || isOnline ? "Attendance remains available if the connection drops." : "Records are stored on this device and queued for sync."}</p>
      </section>
    </aside>
  );
}
