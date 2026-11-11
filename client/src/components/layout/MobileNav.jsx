import { Link } from "react-router-dom";
import { useLocation } from "react-router-dom";
import { BarChart3, BookOpen, Camera, LayoutDashboard, Menu, RefreshCw, Settings, ShieldCheck, Users } from "lucide-react";
import { useSync } from "@/hooks/useSync";
import { useAuth } from "@/components/providers/AppProviders";
import { useState } from "react";

export default function MobileNav() {
  const { pathname } = useLocation();
  const { pendingCount } = useSync();
  const { user } = useAuth();
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const isAdmin = user?.role === "ADMIN";
  const teacherLinks = [
    { name: "Home", href: "/dashboard", icon: LayoutDashboard },
    { name: "Attendance", href: "/attendance", icon: Camera },
    { name: "Timetable", href: "/timetable", icon: BookOpen },
    { name: "Reports", href: "/reports", icon: BarChart3 },
    { name: "Sync", href: "/sync", icon: RefreshCw, badge: pendingCount },
  ];
  const adminLinks = [
    { name: "Home", href: "/dashboard", icon: LayoutDashboard },
    { name: "Attendance", href: "/attendance", icon: Camera },
    { name: "Students", href: "/students", icon: Users },
    { name: "Sync", href: "/sync", icon: RefreshCw, badge: pendingCount },
    { name: "Reports", href: "/reports", icon: BarChart3 },
  ];
  const moreLinks = [
    { name: "Classes & sections", href: "/classes", icon: BookOpen },
    { name: "Teacher accounts", href: "/teachers", icon: ShieldCheck },
    { name: "School settings", href: "/settings", icon: Settings },
    { name: "Weekly timetable", href: "/timetable", icon: BookOpen },
  ];
  const teacherMoreLinks = [
    { name: "My classes", href: "/classes", icon: BookOpen },
    { name: "Students", href: "/students", icon: Users },
  ];
  const links = isAdmin ? adminLinks : teacherLinks;
  const auxiliaryLinks = isAdmin ? moreLinks : teacherMoreLinks;

  return (
    <nav className="app-mobile-nav lg:hidden" aria-label="Mobile navigation">
      {links.map(({ name, href, icon: Icon, badge }) => {
        const isActive = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link key={href} to={href} aria-current={isActive ? "page" : undefined} className={`mobile-nav-link ${isActive ? "mobile-nav-link--active" : ""}`}>
            <span className="relative"><Icon size={19} aria-hidden="true" />{badge > 0 && <span className="mobile-nav-badge">{badge}</span>}</span>
            <span>{name}</span>
          </Link>
        );
      })}
      {(
        <div className="mobile-nav-more">
          <button type="button" className="mobile-nav-link" aria-expanded={isMoreOpen} aria-controls="mobile-more-menu" onClick={() => setIsMoreOpen((open) => !open)}>
            <Menu size={19} aria-hidden="true" />
            <span>More</span>
          </button>
          {isMoreOpen && (
            <div id="mobile-more-menu" className="mobile-more-menu" aria-label="More school tools">
              {auxiliaryLinks.map(({ name, href, icon: Icon }) => (
                <Link key={href} to={href} className="mobile-more-link" onClick={() => setIsMoreOpen(false)}>
                  <Icon size={16} aria-hidden="true" />{name}
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </nav>
  );
}
