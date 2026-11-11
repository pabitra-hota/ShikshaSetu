import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/components/providers/AppProviders";
import AppShell from "@/components/layout/AppShell";
import { offlineService } from "@/lib/offline/service";
import { BookOpen, CalendarDays, Clock3, Pencil, Plus, RefreshCw, Save, Trash2, UserRound } from "lucide-react";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const SCHOOL_DAY_BLOCKS = [
  { label: "Period 1", time: "7:00–7:45 AM", kind: "period" },
  { label: "Period 2", time: "7:45–8:30 AM", kind: "period" },
  { label: "Period 3", time: "8:30–9:15 AM", kind: "period" },
  { label: "Meal break", time: "9:15–9:30 AM", kind: "break" },
  { label: "Period 4", time: "9:30–10:15 AM", kind: "period" },
  { label: "Period 5", time: "10:15–11:00 AM", kind: "period" },
  { label: "Library & guided activity", time: "11:00–11:45 AM", kind: "activity" },
  { label: "Class close & dispersal", time: "11:45 AM–12:00 PM", kind: "activity" },
];

function getSchoolToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
}

function weekdayForDate(date) {
  return new Date(`${date}T00:00:00.000Z`).getUTCDay();
}

function emptyForm(dayOfWeek = new Date().getDay()) {
  return { teacherId: "", classId: "", sectionId: "", subject: "", dayOfWeek: String(dayOfWeek), startTime: "09:00", endTime: "09:45" };
}

function formatDate(dateString) {
  const [year, month, day] = dateString.split("-").map(Number);
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}

export default function TimetablePage() {
  const { user } = useAuth();
  const isPrincipal = user?.role === "ADMIN";
  const [entries, setEntries] = useState([]);
  const [dateEntries, setDateEntries] = useState([]);
  const [classes, setClasses] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState("");
  const [selectedDate, setSelectedDate] = useState(getSchoolToday);
  const [isLoading, setIsLoading] = useState(true);
  const [isOfflineView, setIsOfflineView] = useState(false);
  const [cachedStatusAvailable, setCachedStatusAvailable] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [pageError, setPageError] = useState("");
  const [formError, setFormError] = useState("");
  const [coverageSelections, setCoverageSelections] = useState({});
  const [coverageSavingId, setCoverageSavingId] = useState("");
  const [coverageError, setCoverageError] = useState("");

  const loadTimetable = useCallback(async () => {
    if (!user?.id || !selectedDate) return;
    setIsLoading(true);
    setPageError("");
    try {
      const requests = [fetch("/api/timetable"), fetch(`/api/timetable?date=${encodeURIComponent(selectedDate)}`), fetch("/api/classes")];
      requests.push(isPrincipal ? fetch("/api/teachers") : fetch("/api/students"));
      const responses = await Promise.all(requests);
      const [timetableData, datedData, classData, directoryData] = await Promise.all(responses.map((response) => response.json()));
      if (!responses[0].ok) throw new Error(timetableData.error || "Could not load the timetable.");
      if (!responses[1].ok) throw new Error(datedData.error || "Could not load period status.");
      if (!responses[2].ok) throw new Error(classData.error || "Could not load classes.");
      if (!responses[3].ok) throw new Error(directoryData.error || `Could not load ${isPrincipal ? "teacher accounts" : "students"}.`);

      const allEntries = timetableData.entries || [];
      const dayEntries = datedData.entries || [];
      const statusByEntry = new Map(dayEntries.map((entry) => [entry.id, entry]));
      const entriesWithStatus = allEntries.map((entry) => ({
        ...entry,
        attendanceStatus: statusByEntry.get(entry.id)?.attendanceStatus ?? null,
        attendanceMarker: statusByEntry.get(entry.id)?.attendanceMarker ?? null,
        attendanceMarkedAt: statusByEntry.get(entry.id)?.attendanceMarkedAt ?? null,
        attendanceSessionId: statusByEntry.get(entry.id)?.attendanceSessionId ?? null,
        attendanceStatusDate: statusByEntry.has(entry.id) ? selectedDate : null,
      }));
      const localStatusRows = await Promise.all(dayEntries.map(async (entry) => {
        const info = await offlineService.getOfflineAttendanceSessionInfo(`period:${entry.id}:${selectedDate}`, user.id).catch(() => ({ pendingCount: 0 }));
        return [entry.id, info.pendingCount > 0];
      }));
      const pendingLocalPeriods = new Map(localStatusRows);
      const hydratedEntries = entriesWithStatus.map((entry) => ({ ...entry, hasOfflinePending: pendingLocalPeriods.get(entry.id) ?? false }));

      setEntries(hydratedEntries);
      setDateEntries(dayEntries.map((entry) => ({ ...entry, hasOfflinePending: pendingLocalPeriods.get(entry.id) ?? false, statusAvailable: true })));
      setClasses(classData.classes || []);
      setIsOfflineView(false);
      setCachedStatusAvailable(true);
      await offlineService.ensureRosterOwner(user.id);
      await offlineService.cacheTimetable(hydratedEntries, user.id).catch((cacheError) => console.warn("Could not cache this timetable:", cacheError));

      if (isPrincipal) {
        setTeachers(directoryData.teachers || []);
      } else {
        const rosterClasses = classData.classes || [];
        const rosterSections = rosterClasses.flatMap((schoolClass) => (schoolClass.sections || []).map((section) => ({
          id: section.id,
          name: section.name,
          classId: schoolClass.id,
          className: schoolClass.name,
        })));
        await offlineService.cacheRoster(
          (directoryData.students || []).map((student) => ({ ...student, updatedAt: new Date().toISOString() })),
          rosterClasses.map(({ id, name, gradeLevel }) => ({ id, name, gradeLevel })),
          rosterSections,
          user.id,
        ).catch((cacheError) => console.warn("Could not refresh the teacher offline roster:", cacheError));
      }
    } catch (error) {
      const cachedEntries = await offlineService.getCachedTimetable(user.id).catch(() => []);
      if (cachedEntries.length) {
        const weekday = weekdayForDate(selectedDate);
        const cachedDatedEntries = cachedEntries.filter((entry) => entry.dayOfWeek === weekday).map(async (entry) => {
          const info = await offlineService.getOfflineAttendanceSessionInfo(`period:${entry.id}:${selectedDate}`, user.id).catch(() => ({ pendingCount: 0 }));
          const hasCachedServerStatus = entry.attendanceStatusDate === selectedDate;
          return {
            ...entry,
            attendanceStatus: hasCachedServerStatus ? entry.attendanceStatus : "NOT_MARKED",
            attendanceMarker: hasCachedServerStatus ? entry.attendanceMarker : null,
            attendanceMarkedAt: hasCachedServerStatus ? entry.attendanceMarkedAt : null,
            hasOfflinePending: info.pendingCount > 0,
            statusAvailable: hasCachedServerStatus || info.pendingCount > 0,
          };
        });
        const resolvedDatedEntries = await Promise.all(cachedDatedEntries);
        setEntries(cachedEntries);
        setDateEntries(resolvedDatedEntries);
        const cachedDirectory = await offlineService.getCachedRoster().catch(() => ({ classes: [] }));
        setClasses(cachedDirectory.classes || []);
        setIsOfflineView(true);
        setCachedStatusAvailable(resolvedDatedEntries.every((entry) => entry.statusAvailable));
        setPageError("Showing this account’s saved timetable. Attendance status may need a connection to refresh.");
      } else {
        setPageError(error.message || "Could not load the timetable.");
      }
    } finally {
      setIsLoading(false);
    }
  }, [isPrincipal, selectedDate, user]);

  useEffect(() => { loadTimetable(); }, [loadTimetable]);

  const selectedClass = classes.find((schoolClass) => schoolClass.id === form.classId);
  const sections = selectedClass?.sections || [];
  const selectedWeekday = weekdayForDate(selectedDate);
  const entriesByDay = useMemo(() => WEEKDAYS.map((day, dayOfWeek) => ({
    day,
    dayOfWeek,
    entries: entries.filter((entry) => entry.dayOfWeek === dayOfWeek),
  })).filter((group) => group.entries.length > 0), [entries]);

  const updateClass = (classId) => {
    const nextClass = classes.find((schoolClass) => schoolClass.id === classId);
    setForm((current) => ({ ...current, classId, sectionId: nextClass?.sections?.[0]?.id || "" }));
  };

  const resetForm = () => {
    setEditingId("");
    setForm(emptyForm(selectedWeekday));
    setFormError("");
  };

  const editEntry = (entry) => {
    setEditingId(entry.id);
    setForm({
      teacherId: entry.teacherId,
      classId: entry.classId,
      sectionId: entry.sectionId,
      subject: entry.subject,
      dayOfWeek: String(entry.dayOfWeek),
      startTime: entry.startTime,
      endTime: entry.endTime,
    });
    setFormError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const saveEntry = async (event) => {
    event.preventDefault();
    setFormError("");
    setIsSaving(true);
    try {
      const response = await fetch(editingId ? `/api/timetable/${editingId}` : "/api/timetable", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, dayOfWeek: Number(form.dayOfWeek) }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save this period.");
      resetForm();
      await loadTimetable();
    } catch (error) {
      setFormError(error.message || "Could not save this period.");
    } finally {
      setIsSaving(false);
    }
  };

  const removeEntry = async (entry) => {
    if (!window.confirm(`Remove ${entry.subject} from ${WEEKDAYS[entry.dayOfWeek]}?`)) return;
    try {
      const response = await fetch(`/api/timetable/${entry.id}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not remove this period.");
      if (editingId === entry.id) resetForm();
      await loadTimetable();
    } catch (error) {
      setPageError(error.message || "Could not remove this period.");
    }
  };

  const saveCoverage = async (entry) => {
    setCoverageError("");
    setCoverageSavingId(entry.id);
    try {
      const response = await fetch(`/api/timetable/${entry.id}/coverage`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: selectedDate, teacherId: coverageSelections[entry.id] || null }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not update the cover teacher.");
      await loadTimetable();
    } catch (error) {
      setCoverageError(error.message || "Could not update the cover teacher.");
    } finally {
      setCoverageSavingId("");
    }
  };

  return (
    <AppShell>
      <div className="page-stack">
        <header className="page-heading-card">
          <div>
            <p className="eyebrow compact">Weekly teaching routine</p>
            <h1>{isPrincipal ? "Class timetable" : "My teaching timetable"}</h1>
            <p>{isPrincipal ? "Review period attendance for your school and manage weekly assignments." : "See your assigned periods and mark attendance for each scheduled class."}</p>
          </div>
          <span className="school-class-icon"><CalendarDays size={19} aria-hidden="true" /></span>
        </header>

        <section className="school-day-routine" aria-label="School day routine from 7 AM to noon">
          {SCHOOL_DAY_BLOCKS.map((block) => (
            <div className={`school-day-block school-day-block--${block.kind}`} key={block.label}>
              <span>{block.label}</span>
              <strong>{block.time}</strong>
            </div>
          ))}
        </section>

        <section className="settings-card timetable-status-card">
          <div className="timetable-date-heading"><div><p className="eyebrow compact">Attendance status</p><h2>{formatDate(selectedDate)}</h2><p className="muted-copy">{isPrincipal ? "Every scheduled period is listed with its server-confirmed status." : "Choose one of your scheduled periods to record this class session."}</p></div><label className="form-field">School date<input type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} /></label></div>
          {isLoading ? <p className="state-message" role="status"><RefreshCw size={17} className="animate-spin" aria-hidden="true" /> Loading period status…</p>
            : dateEntries.length === 0 ? <p className="state-message"><CalendarDays size={18} aria-hidden="true" /> No periods are scheduled for {WEEKDAYS[selectedWeekday]}. Choose another date or ask the principal to add a period.</p>
              : <div className="timetable-status-list">{dateEntries.map((entry) => (
                <article className="timetable-status-row" key={entry.id}>
                  <span className="school-class-icon"><BookOpen size={17} aria-hidden="true" /></span>
                  <div className="timetable-status-details"><strong>{entry.subject}</strong><span>{entry.class.name} · {entry.section.name}</span><small><Clock3 size={12} aria-hidden="true" />{entry.startTime}–{entry.endTime} · {entry.effectiveTeacher?.user?.name || entry.teacher.user.name}{entry.coverage ? ` (covering for ${entry.teacher.user.name})` : ""}</small></div>
                  <div className="timetable-status-result">
                    {!entry.statusAvailable ? <span className="attendance-mark-state is-unavailable">Status unavailable</span> : <span className={`attendance-mark-state ${entry.attendanceStatus === "MARKED" ? "is-marked" : "is-not-marked"}`}>{entry.attendanceStatus === "MARKED" ? "Marked" : "Not marked"}</span>}
                    {entry.attendanceStatus === "MARKED" && <small>By {entry.attendanceMarker || "School staff"}{entry.attendanceMarkedAt ? ` · ${new Date(entry.attendanceMarkedAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" })}` : ""}</small>}
                    {entry.hasOfflinePending && <small className="offline-save-hint">Saved on this device · waiting to sync</small>}
                    {!entry.statusAvailable && isOfflineView && <small>Connect to refresh the school record.</small>}
                  </div>
                  {isPrincipal && !isOfflineView && <div className="timetable-cover-controls">
                    <label className="form-field">Cover teacher for this date<select aria-label={`Cover teacher for ${entry.subject}, ${entry.class.name} ${entry.section.name}`} value={coverageSelections[entry.id] ?? entry.coverage?.teacherId ?? ""} onChange={(event) => setCoverageSelections((current) => ({ ...current, [entry.id]: event.target.value }))}>
                      <option value="">Regular teacher · {entry.teacher.user.name}</option>
                      {teachers.filter((teacher) => teacher.id !== entry.teacherId).map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.user?.name || teacher.employeeId}</option>)}
                    </select></label>
                    <button type="button" className="secondary-button min-h-11" onClick={() => saveCoverage(entry)} disabled={coverageSavingId === entry.id || (coverageSelections[entry.id] ?? entry.coverage?.teacherId ?? "") === (entry.coverage?.teacherId ?? "")}>{coverageSavingId === entry.id ? "Saving…" : entry.coverage ? "Update cover" : "Assign cover"}</button>
                  </div>}
                  <Link className="action-button timetable-status-action" to={`/attendance?classId=${encodeURIComponent(entry.classId)}&sectionId=${encodeURIComponent(entry.sectionId)}&timetableEntryId=${encodeURIComponent(entry.id)}&date=${encodeURIComponent(selectedDate)}`}>{entry.attendanceStatus === "MARKED" ? "Review period" : "Mark attendance"}</Link>
                </article>
              ))}</div>}
          {coverageError && <p className="state-message state-message--error" role="alert">{coverageError}</p>}
          {isOfflineView && pageError && <p className="muted-copy" role="status">{pageError}</p>}
        </section>

        {isPrincipal && <section className="settings-card space-y-4">
          <div><p className="eyebrow compact">{editingId ? "Update weekly period" : "Add a weekly period"}</p><h2 className="text-lg font-bold text-slate-900">{editingId ? "Edit timetable entry" : "Schedule a class"}</h2><p className="muted-copy">You can also assign periods directly from each section in Classes &amp; Sections.</p></div>
          <form onSubmit={saveEntry} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <label className="form-field">Teacher<select required value={form.teacherId} onChange={(event) => setForm({ ...form, teacherId: event.target.value })}><option value="">Select teacher</option>{teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.user?.name || teacher.employeeId}</option>)}</select></label>
            <label className="form-field">Class<select required value={form.classId} onChange={(event) => updateClass(event.target.value)}><option value="">Select class</option>{classes.map((schoolClass) => <option key={schoolClass.id} value={schoolClass.id}>{schoolClass.name}</option>)}</select></label>
            <label className="form-field">Section<select required value={form.sectionId} onChange={(event) => setForm({ ...form, sectionId: event.target.value })} disabled={!sections.length}><option value="">Select section</option>{sections.map((section) => <option key={section.id} value={section.id}>{section.name}</option>)}</select></label>
            <label className="form-field">Subject<input required minLength={2} maxLength={80} value={form.subject} onChange={(event) => setForm({ ...form, subject: event.target.value })} placeholder="e.g. Mathematics" /></label>
            <label className="form-field">Day<select value={form.dayOfWeek} onChange={(event) => setForm({ ...form, dayOfWeek: event.target.value })}>{WEEKDAYS.map((day, index) => <option key={day} value={index}>{day}</option>)}</select></label>
            <label className="form-field">Starts at<input required type="time" value={form.startTime} onChange={(event) => setForm({ ...form, startTime: event.target.value })} /></label>
            <label className="form-field">Ends at<input required type="time" value={form.endTime} onChange={(event) => setForm({ ...form, endTime: event.target.value })} /></label>
            <div className="flex items-end gap-2"><button type="submit" className="action-button min-h-11" disabled={isSaving || isOfflineView || !teachers.length || !classes.length}><Save size={15} aria-hidden="true" />{isSaving ? "Saving…" : editingId ? "Save changes" : "Add period"}</button>{editingId && <button type="button" className="secondary-button min-h-11" onClick={resetForm}>Cancel</button>}</div>
          </form>
          {!teachers.length && !isLoading && <p className="muted-copy">Add teacher accounts before creating timetable periods.</p>}
          {formError && <p className="state-message state-message--error" role="alert">{formError}</p>}
          <p className="muted-copy">A teacher or section cannot have two periods that overlap on the same day.</p>
        </section>}

        {pageError && !isOfflineView && <p className="state-message state-message--error" role="alert">{pageError}</p>}
        {isLoading ? <p className="state-message" role="status"><RefreshCw size={17} className="animate-spin" aria-hidden="true" /> Loading weekly timetable…</p>
          : entries.length === 0 ? <div className="state-message"><CalendarDays size={18} aria-hidden="true" />{isPrincipal ? "No weekly periods have been scheduled yet." : "Your timetable is empty. Ask the principal to assign your class periods."}</div>
            : <div className="space-y-4">{entriesByDay.map((group) => (
              <section key={group.day} className="settings-card overflow-hidden p-0">
                <header className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 sm:px-5"><h2 className="font-bold text-slate-900">{group.day}</h2>{group.dayOfWeek === selectedWeekday && <span className="text-[11px] font-bold uppercase tracking-wide text-emerald-700">Selected date</span>}</header>
                <div className="divide-y divide-slate-100">{group.entries.map((entry) => (
                  <article key={entry.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                    <div className="flex min-w-0 items-start gap-3">
                      <span className="school-class-icon shrink-0"><BookOpen size={18} aria-hidden="true" /></span>
                      <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="font-bold text-slate-900">{entry.subject}</h3><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">{entry.class.name} · {entry.section.name}</span></div><p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500"><span className="inline-flex items-center gap-1.5"><Clock3 size={13} aria-hidden="true" />{entry.startTime}–{entry.endTime}</span><span className="inline-flex items-center gap-1.5"><UserRound size={13} aria-hidden="true" />{entry.teacher.user.name}</span></p></div>
                    </div>
                    {isPrincipal && !isOfflineView && <div className="flex shrink-0 items-center gap-2 self-end sm:self-auto"><button type="button" className="icon-button" onClick={() => editEntry(entry)} aria-label={`Edit ${entry.subject} period`}><Pencil size={15} aria-hidden="true" /></button><button type="button" className="icon-button text-rose-700" onClick={() => removeEntry(entry)} aria-label={`Remove ${entry.subject} period`}><Trash2 size={15} aria-hidden="true" /></button></div>}
                  </article>
                ))}</div>
              </section>
            ))}</div>}
      </div>
    </AppShell>
  );
}
