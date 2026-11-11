import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { BookOpen, CalendarDays, Clock3, Pencil, Plus, RefreshCw, Save, Trash2, Users, X } from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import SchoolRoutineSetupButton from "@/components/school/SchoolRoutineSetupButton";
import { useAuth } from "@/components/providers/AppProviders";
import { useSchoolDirectory } from "@/hooks/useSchoolDirectory";
import { classSchema } from "@/lib/validation";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const emptyClassForm = { name: "", gradeLevel: "1", sections: "A, B" };

function emptyPeriodForm() {
  return { teacherId: "", subject: "", dayOfWeek: "1", startTime: "09:00", endTime: "09:45" };
}

export default function ClassesPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: directory, isPending, isError, error } = useSchoolDirectory();
  const classes = directory?.classes ?? [];
  const dialogRef = useRef(null);
  const [form, setForm] = useState(emptyClassForm);
  const [isClassDialogOpen, setIsClassDialogOpen] = useState(false);
  const [isSavingClass, setIsSavingClass] = useState(false);
  const [classFormError, setClassFormError] = useState("");
  const [teachers, setTeachers] = useState([]);
  const [timetableEntries, setTimetableEntries] = useState([]);
  const [isLoadingSchedule, setIsLoadingSchedule] = useState(false);
  const [scheduleError, setScheduleError] = useState("");
  const [expandedSectionId, setExpandedSectionId] = useState("");
  const [editingPeriodId, setEditingPeriodId] = useState("");
  const [periodForm, setPeriodForm] = useState(emptyPeriodForm);
  const [isSavingPeriod, setIsSavingPeriod] = useState(false);
  const [periodFormError, setPeriodFormError] = useState("");

  const refreshScheduleData = async () => {
    const [timetableResponse, teachersResponse] = await Promise.all([fetch("/api/timetable"), fetch("/api/teachers")]);
    const [timetableData, teacherData] = await Promise.all([timetableResponse.json(), teachersResponse.json()]);
    if (!timetableResponse.ok) throw new Error(timetableData.error || "Could not refresh timetable periods.");
    if (!teachersResponse.ok) throw new Error(teacherData.error || "Could not refresh teacher accounts.");
    setTimetableEntries(timetableData.entries || []);
    setTeachers(teacherData.teachers || []);
    setScheduleError("");
  };

  useEffect(() => {
    if (user?.role !== "ADMIN") return;
    let isCurrent = true;
    setIsLoadingSchedule(true);
    Promise.all([fetch("/api/timetable"), fetch("/api/teachers")])
      .then(async ([timetableResponse, teachersResponse]) => {
        const [timetableData, teacherData] = await Promise.all([timetableResponse.json(), teachersResponse.json()]);
        if (!timetableResponse.ok) throw new Error(timetableData.error || "Could not load timetable periods.");
        if (!teachersResponse.ok) throw new Error(teacherData.error || "Could not load teacher accounts.");
        if (isCurrent) {
          setTimetableEntries(timetableData.entries || []);
          setTeachers(teacherData.teachers || []);
          setScheduleError("");
        }
      })
      .catch((caughtError) => {
        if (isCurrent) setScheduleError(caughtError.message || "Could not load timetable periods.");
      })
      .finally(() => {
        if (isCurrent) setIsLoadingSchedule(false);
      });
    return () => { isCurrent = false; };
  }, [user?.role]);

  const openClassDialog = () => {
    setForm(emptyClassForm);
    setClassFormError("");
    setIsClassDialogOpen(true);
    if (!dialogRef.current?.open) dialogRef.current?.showModal();
  };

  const closeClassDialog = () => {
    if (dialogRef.current?.open) dialogRef.current.close();
    setIsClassDialogOpen(false);
  };

  const createClass = async (event) => {
    event.preventDefault();
    setClassFormError("");
    const parsed = classSchema.safeParse({
      name: form.name,
      gradeLevel: form.gradeLevel,
      sections: form.sections.split(",").map((section) => section.trim()).filter(Boolean),
    });
    if (!parsed.success) {
      setClassFormError(parsed.error.issues[0]?.message || "Review the class details and try again.");
      return;
    }
    setIsSavingClass(true);
    try {
      const response = await fetch("/api/classes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not create this class.");
      await queryClient.invalidateQueries({ queryKey: ["school-directory"] });
      closeClassDialog();
    } catch (caughtError) {
      setClassFormError(caughtError.message || "Could not create this class.");
    } finally {
      setIsSavingClass(false);
    }
  };

  const toggleSectionSchedule = (schoolClass, section) => {
    if (expandedSectionId === section.id) {
      setExpandedSectionId("");
      setEditingPeriodId("");
      setPeriodFormError("");
      return;
    }
    setExpandedSectionId(section.id);
    setEditingPeriodId("");
    setPeriodForm({ ...emptyPeriodForm(), classId: schoolClass.id, sectionId: section.id });
    setPeriodFormError("");
  };

  const editPeriod = (entry) => {
    setEditingPeriodId(entry.id);
    setPeriodForm({
      teacherId: entry.teacherId,
      subject: entry.subject,
      dayOfWeek: String(entry.dayOfWeek),
      startTime: entry.startTime,
      endTime: entry.endTime,
      classId: entry.classId,
      sectionId: entry.sectionId,
    });
    setPeriodFormError("");
  };

  const resetPeriodForm = () => {
    setEditingPeriodId("");
    setPeriodForm((current) => ({ ...emptyPeriodForm(), classId: current.classId, sectionId: current.sectionId }));
    setPeriodFormError("");
  };

  const savePeriod = async (event) => {
    event.preventDefault();
    setIsSavingPeriod(true);
    setPeriodFormError("");
    try {
      const payload = { ...periodForm, dayOfWeek: Number(periodForm.dayOfWeek) };
      const response = await fetch(editingPeriodId ? `/api/timetable/${editingPeriodId}` : "/api/timetable", {
        method: editingPeriodId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save the timetable period.");
      setTimetableEntries((current) => editingPeriodId
        ? current.map((entry) => entry.id === data.entry.id ? data.entry : entry)
        : [...current, data.entry]);
      resetPeriodForm();
    } catch (caughtError) {
      setPeriodFormError(caughtError.message || "Could not save the timetable period.");
    } finally {
      setIsSavingPeriod(false);
    }
  };

  const removePeriod = async (entry) => {
    if (!window.confirm(`Remove ${entry.subject} from ${WEEKDAYS[entry.dayOfWeek]}?`)) return;
    setPeriodFormError("");
    try {
      const response = await fetch(`/api/timetable/${entry.id}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not remove the timetable period.");
      setTimetableEntries((current) => current.filter((item) => item.id !== entry.id));
      if (editingPeriodId === entry.id) resetPeriodForm();
    } catch (caughtError) {
      setPeriodFormError(caughtError.message || "Could not remove the timetable period.");
    }
  };

  return (
    <AppShell>
      <section className="page-stack">
        <header className="page-heading-card">
          <div>
            <p className="eyebrow compact">School structure</p>
            <h1>Classes &amp; sections</h1>
            <p>{user?.role === "ADMIN" ? "Organize grade levels, sections, and each section’s weekly teaching periods." : "Review the classes and sections assigned to your teacher account."}</p>
          </div>
          {user?.role === "ADMIN" && <div className="class-heading-actions"><SchoolRoutineSetupButton onComplete={refreshScheduleData} /><button type="button" className="action-button" onClick={openClassDialog}><Plus size={16} aria-hidden="true" /> Add class</button></div>}
        </header>

        {user && user.role !== "ADMIN" && <p className="state-message">Only your assigned classes and sections are listed here. Contact the principal to change school structure or assignments.</p>}
        {isPending && <p className="state-message" role="status"><RefreshCw size={17} aria-hidden="true" /> Loading classes…</p>}
        {isError && <p className="state-message state-message--error" role="alert">{error.message}</p>}
        {scheduleError && <p className="state-message state-message--error" role="alert">{scheduleError}</p>}
        {!isPending && !isError && classes.length === 0 && <p className="state-message"><BookOpen size={18} aria-hidden="true" /> No classes have been added yet.</p>}

        {!isPending && !isError && classes.length > 0 && (
          <div className="class-management-grid">
            {classes.map((schoolClass) => (
              <article className="school-class-card" key={schoolClass.id}>
                <header className="school-class-heading">
                  <span className="school-class-icon"><BookOpen size={17} aria-hidden="true" /></span>
                  <div><p className="eyebrow compact">Grade {schoolClass.gradeLevel}</p><h2>{schoolClass.name}</h2></div>
                  <span className="school-class-count"><Users size={14} aria-hidden="true" /> {schoolClass.sections?.length ?? 0} sections</span>
                </header>
                {schoolClass.sections?.length ? (
                  <ul className="school-section-list">
                    {schoolClass.sections.map((section) => {
                      const sectionEntries = timetableEntries
                        .filter((entry) => entry.sectionId === section.id && entry.isActive !== false)
                        .sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.startTime.localeCompare(b.startTime));
                      const isExpanded = expandedSectionId === section.id;
                      return (
                        <li key={section.id} className={`section-schedule-item ${isExpanded ? "is-expanded" : ""}`}>
                          <div className="section-schedule-header">
                            <span><strong>{section.name.startsWith("Section ") ? section.name : `Section ${section.name}`}</strong><small>{section.classTeacherName || "Teacher not assigned"}</small></span>
                            <span className="school-section-students">{section.studentCount ?? 0} students</span>
                            {user?.role === "ADMIN" && <button type="button" className="section-schedule-toggle" onClick={() => toggleSectionSchedule(schoolClass, section)} aria-expanded={isExpanded} aria-controls={`schedule-${section.id}`}><CalendarDays size={14} aria-hidden="true" />{isExpanded ? "Close" : "Timetable"}</button>}
                          </div>
                          {isExpanded && user?.role === "ADMIN" && (
                            <div id={`schedule-${section.id}`} className="section-timetable-editor">
                              <div className="section-timetable-title"><div><strong>Weekly periods</strong><small>{schoolClass.name} · {section.name}</small></div><span>{sectionEntries.length} scheduled</span></div>
                              {isLoadingSchedule ? <p className="muted-copy">Loading assigned periods…</p> : sectionEntries.length === 0 ? <p className="muted-copy">No periods yet. Add the first subject period for this section.</p> : (
                                <div className="section-period-list">
                                  {sectionEntries.map((entry) => (
                                    <div className="section-period-row" key={entry.id}>
                                      <span className="section-period-time"><Clock3 size={13} aria-hidden="true" />{WEEKDAYS[entry.dayOfWeek]} · {entry.startTime}–{entry.endTime}</span>
                                      <span className="section-period-info"><strong>{entry.subject}</strong><small>{entry.teacher?.user?.name || "Teacher"}</small></span>
                                      <span className="section-period-actions"><button type="button" className="icon-button" onClick={() => editPeriod(entry)} aria-label={`Edit ${entry.subject} period`}><Pencil size={14} aria-hidden="true" /></button><button type="button" className="icon-button text-rose-700" onClick={() => removePeriod(entry)} aria-label={`Remove ${entry.subject} period`}><Trash2 size={14} aria-hidden="true" /></button></span>
                                    </div>
                                  ))}
                                </div>
                              )}
                              <form className="section-period-form" onSubmit={savePeriod}>
                                <p className="eyebrow compact">{editingPeriodId ? "Edit period" : "Add a period"}</p>
                                <label className="form-field">Teacher<select required value={periodForm.teacherId} onChange={(event) => setPeriodForm({ ...periodForm, teacherId: event.target.value })}><option value="">Select teacher</option>{teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.user?.name || teacher.employeeId}</option>)}</select></label>
                                <label className="form-field">Subject<input required minLength={2} maxLength={80} value={periodForm.subject} onChange={(event) => setPeriodForm({ ...periodForm, subject: event.target.value })} placeholder="e.g. Mathematics" /></label>
                                <label className="form-field">Weekday<select value={periodForm.dayOfWeek} onChange={(event) => setPeriodForm({ ...periodForm, dayOfWeek: event.target.value })}>{WEEKDAYS.map((day, index) => <option key={day} value={index}>{day}</option>)}</select></label>
                                <label className="form-field">Starts<input required type="time" value={periodForm.startTime} onChange={(event) => setPeriodForm({ ...periodForm, startTime: event.target.value })} /></label>
                                <label className="form-field">Ends<input required type="time" value={periodForm.endTime} onChange={(event) => setPeriodForm({ ...periodForm, endTime: event.target.value })} /></label>
                                {periodFormError && <p className="form-error section-period-form-error" role="alert">{periodFormError}</p>}
                                <div className="section-period-form-actions"><button type="submit" className="action-button" disabled={isSavingPeriod || isLoadingSchedule || !teachers.length}><Save size={14} aria-hidden="true" />{isSavingPeriod ? "Saving…" : editingPeriodId ? "Save period" : "Add period"}</button>{editingPeriodId && <button type="button" className="secondary-button" onClick={resetPeriodForm}>Cancel</button>}</div>
                              </form>
                              <p className="muted-copy">The same teacher or section cannot have overlapping periods on one weekday.</p>
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                ) : <p className="muted-copy">No sections have been created for this class.</p>}
              </article>
            ))}
          </div>
        )}
      </section>

      <dialog ref={dialogRef} className="form-dialog" onCancel={(event) => { event.preventDefault(); closeClassDialog(); }} onClose={() => setIsClassDialogOpen(false)} role="dialog" aria-modal="true" aria-labelledby="class-dialog-title" aria-describedby="class-dialog-description">
        {isClassDialogOpen && <form onSubmit={createClass} className="dialog-content">
          <header className="dialog-heading">
            <div><p className="eyebrow compact">School structure</p><h2 id="class-dialog-title">Add a class</h2><p id="class-dialog-description" className="muted-copy">Create a grade and its sections for the school roster.</p></div>
            <button type="button" className="icon-button" onClick={closeClassDialog} aria-label="Close class form"><X size={17} aria-hidden="true" /></button>
          </header>
          <div className="form-grid">
            <label>Class name<input required minLength={2} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="e.g. Class 7" /></label>
            <label>Grade level<input type="number" required min="1" max="12" value={form.gradeLevel} onChange={(event) => setForm({ ...form, gradeLevel: event.target.value })} /></label>
            <label className="class-sections-field">Sections<input required value={form.sections} onChange={(event) => setForm({ ...form, sections: event.target.value })} placeholder="A, B, C" /><small>Enter section names separated by commas.</small></label>
          </div>
          {classFormError && <p className="form-error" role="alert">{classFormError}</p>}
          <footer className="dialog-actions"><button type="button" className="secondary-button" onClick={closeClassDialog}>Cancel</button><button type="submit" className="action-button" disabled={isSavingClass}><Save size={15} aria-hidden="true" /> {isSavingClass ? "Saving…" : "Create class"}</button></footer>
        </form>}
      </dialog>
    </AppShell>
  );
}
