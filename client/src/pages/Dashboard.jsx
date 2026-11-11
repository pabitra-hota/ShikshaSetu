import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import AppShell from "@/components/layout/AppShell";
import PeriodAttendancePanel from "@/components/dashboard/PeriodAttendancePanel";
import { useAuth } from "@/components/providers/AppProviders";
import { useSync } from "@/hooks/useSync";
import {
  AlertCircle,
  ArrowRight,
  BarChart3,
  Camera,
  CheckCircle2,
  Clock3,
  FileSpreadsheet,
  RefreshCw,
  ShieldAlert,
  Users,
  Wifi,
  WifiOff,
  XCircle,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export default function DashboardPage() {
  const { user } = useAuth();
  const { isOnline, isSyncing, pendingCount, syncNow } = useSync();
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  async function fetchDashboardData() {
    try {
      const response = await fetch("/api/dashboard");
      if (response.ok) setData(await response.json());
    } catch (error) {
      console.error("Dashboard fetch error:", error);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => { fetchDashboardData(); }, []);

  const metrics = data?.metrics;
  const cards = [
    { label: "Enrolled", value: metrics?.totalStudents ?? 0, note: "Active students", icon: Users, tone: "metric-neutral" },
    { label: "Present", value: metrics?.presentCount ?? 0, note: metrics?.recordedCount ? `${Math.round(metrics.presentCount / metrics.recordedCount * 100)}% of records` : "Today", icon: CheckCircle2, tone: "metric-green" },
    { label: "Absent", value: metrics?.absentCount ?? 0, note: "May need follow-up", icon: XCircle, tone: "metric-coral" },
    { label: "Late / excused", value: (metrics?.lateCount ?? 0) + (metrics?.excusedCount ?? 0), note: `${metrics?.lateCount ?? 0} late · ${metrics?.excusedCount ?? 0} excused`, icon: Clock3, tone: "metric-sand" },
    { label: "Attendance", value: `${metrics?.dailyPercentage ?? 0}%`, note: user?.role === "ADMIN" ? "School-wide today" : "Your assigned classes today", icon: BarChart3, tone: "metric-teal" },
  ];

  return (
    <AppShell>
      <div className="attendance-dashboard">
        <section className="dashboard-heading">
          <div>
            <div className="eyebrow"><span className="eyebrow-line" /> CLASSROOM OVERVIEW</div>
            <h1>Attendance, at a glance.</h1>
          <p>{user?.role === "ADMIN" ? "Today’s school-wide records and the follow-ups that need your attention." : "Today’s records and follow-ups for your assigned classes."}</p>
          </div>
          <div className={`dashboard-connectivity ${isOnline ? "is-connected" : "is-disconnected"}`}>
            {isOnline ? <Wifi size={15} /> : <WifiOff size={15} />}
            {isOnline ? "Connected" : "Offline mode"}
          </div>
        </section>

        <section className="dashboard-actions" aria-label="Quick actions">
          <div><span className="dashboard-action-icon"><Camera size={18} /></span><div><small>READY WHEN YOU ARE</small><strong>Take today’s attendance</strong></div></div>
          <Link to="/attendance" className="button-primary">Open attendance <ArrowRight size={16} /></Link>
          {user?.role === "ADMIN" ? <Link to="/reports" className="secondary-action"><FileSpreadsheet size={15} /> View reports</Link> : <Link to="/timetable" className="secondary-action"><Clock3 size={15} /> My timetable</Link>}
        </section>

        {pendingCount > 0 && (
          <div className="sync-alert" role="status">
            <span className="sync-alert-icon"><AlertCircle size={18} /></span>
            <div><strong>{pendingCount} attendance batch{pendingCount === 1 ? "" : "es"} waiting to sync</strong><p>{isOnline ? "You’re online. Sync the records when you’re ready." : "Records are saved on this device and will sync when you’re back online."}</p></div>
            <button className="sync-alert-button" onClick={() => syncNow().then(fetchDashboardData)} disabled={isSyncing || !isOnline}><RefreshCw size={14} className={isSyncing ? "animate-spin" : ""} />{isSyncing ? "Syncing…" : "Sync now"}</button>
          </div>
        )}

        <PeriodAttendancePanel />

        <section className="attendance-metrics" aria-label="Today’s attendance summary">
          {cards.map(({ label, value, note, icon: Icon, tone }) => (
            <article className={`attendance-metric ${tone}`} key={label}>
              <div className="attendance-metric-top"><span>{label}</span><Icon size={16} /></div>
              <strong>{isLoading ? "—" : value}</strong>
              <small>{note}</small>
            </article>
          ))}
        </section>

        <section className="dashboard-grid dashboard-grid-main">
          <article className="dashboard-panel trend-panel">
            <div className="dashboard-panel-heading"><div><h2>Attendance over the last 7 days</h2><p>{user?.role === "ADMIN" ? "A school-wide view of daily attendance." : "Attendance in your assigned classes."}</p></div><span className="panel-badge">WEEKLY</span></div>
            <div className="trend-chart">
              {data?.trends?.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data.trends} margin={{ top: 10, right: 12, left: -20, bottom: 0 }}>
                    <defs><linearGradient id="attendanceTrend" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#668f89" stopOpacity={0.28} /><stop offset="95%" stopColor="#668f89" stopOpacity={0} /></linearGradient></defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#edf0eb" />
                    <XAxis dataKey="dayName" stroke="#88938e" fontSize={10} tickLine={false} axisLine={false} />
                    <YAxis stroke="#88938e" fontSize={10} tickLine={false} axisLine={false} domain={[0, 100]} />
                    <Tooltip content={({ active, payload }) => active && payload?.length ? <div className="chart-tooltip"><strong>{payload[0].payload.date}</strong><span>{payload[0].payload.percentage}% attendance</span><small>{payload[0].payload.present} present of {payload[0].payload.total}</small></div> : null} />
                    <Area type="monotone" dataKey="percentage" stroke="#527c7d" strokeWidth={2.5} fill="url(#attendanceTrend)" />
                  </AreaChart>
                </ResponsiveContainer>
              ) : <div className="chart-empty">{isLoading ? "Loading attendance history…" : "Attendance history will appear here."}</div>}
            </div>
          </article>

          <article className="dashboard-panel class-panel">
            <div className="dashboard-panel-heading"><div><h2>By class</h2><p>Today’s attendance rate.</p></div></div>
            <div className="class-rate-list">
              {data?.classStats?.length ? data.classStats.map((classStat) => (
                <div className="class-rate" key={classStat.id}><div><strong>{classStat.name}</strong><span>{classStat.present} of {classStat.total} present</span></div><b>{classStat.rate}%</b><div className="class-rate-track"><span style={{ width: `${classStat.rate}%` }} /></div></div>
              )) : <p className="panel-empty">Class summaries will appear when records are available.</p>}
            </div>
            <div className="dashboard-panel-footer"><span>Cutoff time · 10:30 AM</span>{user?.role === "ADMIN" ? <Link to="/reports">Full report <ArrowRight size={13} /></Link> : <Link to="/classes">My classes <ArrowRight size={13} /></Link>}</div>
          </article>
        </section>

        <section className="dashboard-grid dashboard-grid-bottom">
          <article className="dashboard-panel absence-panel">
            <div className="dashboard-panel-heading"><div><h2>Absence follow-ups</h2><p>Students with repeated absences who may need a check-in.</p></div><span className="alert-label"><ShieldAlert size={13} /> FOLLOW UP</span></div>
            <div className="absence-list">
              {data?.repeatedAbsenceStudents?.length ? data.repeatedAbsenceStudents.map((student) => (
                <div className="absence-row" key={student.id}><div><strong>{student.name} <span>Roll {student.rollNumber}</span></strong><small>{student.className} · {student.sectionName} · Guardian {student.guardianPhone || "phone not listed"}</small></div><span className="absence-count">{student.absenceCount} absences</span><Link to="/students" aria-label={`View ${student.name} student record`}><ArrowRight size={15} /></Link></div>
              )) : <div className="panel-empty">No repeated absences to follow up today.</div>}
            </div>
          </article>

          <article className="dashboard-panel sync-panel">
            <div className="dashboard-panel-heading"><div><h2>Sync status</h2><p>Your records stay on this device until they upload.</p></div><RefreshCw size={16} /></div>
            <div className="sync-details"><div><span>Connection</span><strong>{isOnline ? "Online" : "Offline"}</strong></div><div><span>Waiting to sync</span><strong>{pendingCount} batch{pendingCount === 1 ? "" : "es"}</strong></div><div><span>Last server sync</span><strong>{metrics?.lastServerSync ? new Date(metrics.lastServerSync).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "Not yet"}</strong></div></div>
            <Link to="/sync" className="sync-center-link">Open sync center <ArrowRight size={15} /></Link>
          </article>
        </section>
      </div>
    </AppShell>
  );
}
