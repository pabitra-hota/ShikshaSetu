import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/components/providers/AppProviders";
import { offlineService } from "@/lib/offline/service";
import { ArrowRight, BookOpen, CalendarDays, Clock3, RefreshCw } from "lucide-react";

function getSchoolToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
}

function getWeekday(date) {
  return new Date(`${date}T00:00:00.000Z`).getUTCDay();
}

function formatDate(date) {
  const [year, month, day] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Asia/Kolkata",
  }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}

function formatTime(date) {
  return new Date(date).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  });
}

function getReportHref(entry, date) {
  const params = new URLSearchParams({
    classId: entry.classId,
    sectionId: entry.sectionId,
    startDate: date,
    endDate: date,
  });
  return `/reports?${params.toString()}`;
}

export default function PeriodAttendancePanel() {
  const { user } = useAuth();
  const isPrincipal = user?.role === "ADMIN";
  const [selectedDate, setSelectedDate] = useState(getSchoolToday);
  const [periods, setPeriods] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshVersion, setRefreshVersion] = useState(0);

  useEffect(() => {
    if (!user?.id || !selectedDate) return undefined;
    let cancelled = false;

    async function loadPeriods() {
      setIsLoading(true);
      setError("");
      try {
        const response = await fetch(`/api/timetable?date=${encodeURIComponent(selectedDate)}`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not load scheduled periods.");
        if (!cancelled) setPeriods(data.entries || []);
      } catch (loadError) {
        const cached = await offlineService.getCachedTimetable(user.id).catch(() => []);
        const todaysCachedPeriods = cached.filter((entry) => entry.dayOfWeek === getWeekday(selectedDate));
        const cachedPeriods = await Promise.all(todaysCachedPeriods.map(async (entry) => {
          const pending = await offlineService.getOfflineAttendanceSessionInfo(`period:${entry.id}:${selectedDate}`, user.id).catch(() => ({ pendingCount: 0 }));
          const hasServerStatus = entry.attendanceStatusDate === selectedDate;
          return {
            ...entry,
            attendanceStatus: hasServerStatus ? entry.attendanceStatus : "NOT_MARKED",
            attendanceMarker: hasServerStatus ? entry.attendanceMarker : null,
            attendanceMarkedAt: hasServerStatus ? entry.attendanceMarkedAt : null,
            hasOfflinePending: pending.pendingCount > 0,
            statusAvailable: hasServerStatus || pending.pendingCount > 0,
          };
        }));
        if (!cancelled) {
          setPeriods(cachedPeriods);
          setError(cachedPeriods.length
            ? "Offline view: saved timetable shown; server attendance status may be out of date."
            : loadError.message || "Could not load scheduled periods.");
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    loadPeriods();
    return () => { cancelled = true; };
  }, [refreshVersion, selectedDate, user?.id]);

  return (
    <section className="dashboard-panel dashboard-period-panel" aria-labelledby="dashboard-periods-title">
      <div className="timetable-date-heading dashboard-period-heading">
        <div>
          <p className="eyebrow compact">{isPrincipal ? "SCHOOL TIMETABLE" : "YOUR ASSIGNED PERIODS"}</p>
          <h2 id="dashboard-periods-title">Period attendance</h2>
          <p className="muted-copy">{isPrincipal ? "Check each teacher’s class completion and open the matching class report." : "Choose one of your assigned subjects to review the roster and mark attendance."}</p>
        </div>
        <div className="dashboard-period-controls">
          <label className="form-field">School date<input type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} /></label>
          <button type="button" className="icon-button" onClick={() => setRefreshVersion((value) => value + 1)} disabled={isLoading} aria-label="Refresh period attendance status">
            <RefreshCw size={16} className={isLoading ? "animate-spin" : ""} aria-hidden="true" />
          </button>
        </div>
      </div>

      <p className="dashboard-period-date"><CalendarDays size={14} aria-hidden="true" />{selectedDate ? formatDate(selectedDate) : "Choose a date"}</p>
      {isPrincipal && <Link className="dashboard-period-week-link" to="/timetable">View full weekly timetable <ArrowRight size={14} aria-hidden="true" /></Link>}
      {error && <p className="dashboard-period-message" role="status">{error}</p>}
      {isLoading ? <p className="state-message" role="status"><RefreshCw size={16} className="animate-spin" aria-hidden="true" /> Loading scheduled periods…</p>
        : periods.length === 0 ? <p className="state-message"><BookOpen size={17} aria-hidden="true" />{isPrincipal ? "No class periods are scheduled for this date." : "No periods are assigned to you for this date. Ask the principal to update the timetable."}</p>
          : <div className="timetable-status-list dashboard-period-list">
            {periods.map((period) => {
              const attendanceHref = `/attendance?classId=${encodeURIComponent(period.classId)}&sectionId=${encodeURIComponent(period.sectionId)}&timetableEntryId=${encodeURIComponent(period.id)}&date=${encodeURIComponent(selectedDate)}`;
              const marked = period.attendanceStatus === "MARKED";
              const statusAvailable = period.statusAvailable !== false;
              return (
                <article className="timetable-status-row" key={period.id}>
                  <span className="dashboard-period-icon"><BookOpen size={16} aria-hidden="true" /></span>
                  <div className="timetable-status-details">
                    <strong>{period.subject}</strong>
                    <span>{period.class?.name || "Class"} · Section {period.section?.name || "—"}</span>
                    <small><Clock3 size={12} aria-hidden="true" />{period.startTime}–{period.endTime} · {isPrincipal ? `Assigned to ${period.teacher?.user?.name || "teacher"}` : "Assigned to you"}</small>
                  </div>
                  <div className="timetable-status-result">
                    {!statusAvailable
                      ? <span className="attendance-mark-state is-unavailable">Status unavailable</span>
                      : <span className={`attendance-mark-state ${marked ? "is-marked" : "is-not-marked"}`}>{marked ? "Marked" : "Not marked"}</span>}
                    {marked && period.attendanceMarker && <small>By {period.attendanceMarker}{period.attendanceMarkedAt ? ` · ${formatTime(period.attendanceMarkedAt)}` : ""}</small>}
                    {period.hasOfflinePending && <small className="offline-save-hint">Saved on this device · pending sync</small>}
                  </div>
                  {isPrincipal
                    ? <Link className="secondary-button dashboard-period-action" to={getReportHref(period, selectedDate)}>View report <ArrowRight size={14} aria-hidden="true" /></Link>
                    : <Link className="action-button dashboard-period-action" to={attendanceHref}>{marked ? "Review attendance" : "Mark attendance"} <ArrowRight size={14} aria-hidden="true" /></Link>}
                </article>
              );
            })}
          </div>}
  </section>
  );
}
