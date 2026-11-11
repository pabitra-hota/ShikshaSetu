import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useNavigate } from "react-router-dom";
import { GraduationCap, LogOut, RefreshCw, ShieldCheck, Wifi, WifiOff } from "lucide-react";
import { useAuth } from "@/components/providers/AppProviders";
import ThemeToggle from "@/components/theme/ThemeToggle";
import { useSync } from "@/hooks/useSync";

export default function Navbar({ user }) {
  const navigate = useNavigate();
  const { setUser } = useAuth();
  const { isOnline, isSyncing, pendingCount, syncNow, mounted } = useSync();
  const [syncStatusMsg, setSyncStatusMsg] = useState("");
  const [currentDate, setCurrentDate] = useState("");

  useEffect(() => {
    setCurrentDate(new Date().toLocaleDateString("en-IN", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    }));
  }, []);

  const handleSyncClick = async () => {
    setSyncStatusMsg("Syncing…");
    const result = await syncNow();
    setSyncStatusMsg(result.success ? `Synced ${result.syncedBatches} batch(es)` : result.error || "Sync failed");
    window.setTimeout(() => setSyncStatusMsg(""), 4000);
  };

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    localStorage.removeItem("shikshasetu_user");
    setUser(null);
    navigate("/login");
    };

  return (
    <header className="app-topbar sticky top-0 z-40 w-full border-b">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link to={user ? "/dashboard" : "/"} className="flex items-center gap-2.5" aria-label="ShikshaSetu home">
          <span className="brand-mark"><GraduationCap size={22} aria-hidden="true" /></span>
          <span>
            <span className="brand-name">ShikshaSetu</span>
            <span className="brand-school">{user?.schoolName || "School attendance workspace"}</span>
          </span>
        </Link>

        <div className="hidden items-center gap-3 md:flex">
          <span className={`connection-pill ${!mounted || isOnline ? "connection-pill--online" : "connection-pill--offline"}`}>
            {!mounted || isOnline ? <Wifi size={14} aria-hidden="true" /> : <WifiOff size={14} aria-hidden="true" />}
            {!mounted || isOnline ? "Online" : "Offline mode"}
          </span>
          {user && (
            <>
              <button type="button" onClick={handleSyncClick} disabled={isSyncing || !isOnline} className={`quiet-button ${pendingCount > 0 ? "quiet-button--pending" : ""}`}>
                <RefreshCw size={14} className={isSyncing ? "animate-spin" : ""} aria-hidden="true" />
                {isSyncing ? "Syncing…" : pendingCount > 0 ? `Sync now (${pendingCount})` : "Synced"}
              </button>
              <span className="topbar-date">{currentDate}</span>
            </>
          )}
          {syncStatusMsg && <span className="sr-only" role="status">{syncStatusMsg}</span>}
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <ThemeToggle />
          {user ? (
            <>
              <span className="hidden text-right sm:block">
                <span className="account-name">{user.name}</span>
                <span className="account-role"><ShieldCheck size={12} aria-hidden="true" />{user.role === "ADMIN" ? "Principal" : "Teacher"}</span>
              </span>
              <button type="button" onClick={handleLogout} className="icon-button" aria-label="Log out" title="Log out">
                <LogOut size={17} aria-hidden="true" />
              </button>
            </>
          ) : (
            <Link to="/login" className="landing-login">Classroom login</Link>
          )}
        </div>
      </div>
    </header>
  );
}
