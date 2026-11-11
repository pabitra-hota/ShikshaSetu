import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Save, ShieldCheck, Users, X } from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import SchoolRoutineSetupButton from "@/components/school/SchoolRoutineSetupButton";
import { useAuth } from "@/components/providers/AppProviders";
import { useSchoolDirectory } from "@/hooks/useSchoolDirectory";
import { teacherCreateSchema, teacherUpdateSchema } from "@/lib/validation";

const emptyForm = { name: "", email: "", password: "", employeeId: "", phone: "", specialization: "", classIds: [] };

async function fetchTeachers() {
  const response = await fetch("/api/teachers");
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Could not load teachers.");
  return data.teachers ?? [];
}

export default function TeachersPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: teachers = [], isPending, isError, error } = useQuery({ queryKey: ["teachers"], queryFn: fetchTeachers, enabled: user?.role === "ADMIN" });
  const { data: directory } = useSchoolDirectory();
  const classes = directory?.classes ?? [];
  const dialogRef = useRef(null);
  const [isOpen, setIsOpen] = useState(false);
  const [editingTeacher, setEditingTeacher] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [fieldError, setFieldError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const openCreate = () => {
    setEditingTeacher(null);
    setForm(emptyForm);
    setFieldError("");
    setSaveError("");
    setIsOpen(true);
    window.requestAnimationFrame(() => dialogRef.current?.showModal());
  };

  const openEdit = (teacher) => {
    setEditingTeacher(teacher);
    setForm({
      name: teacher.user.name,
      email: teacher.user.email,
      password: "",
      employeeId: teacher.employeeId,
      phone: teacher.phone || "",
      specialization: teacher.specialization || "",
      classIds: teacher.assignedClasses.map((schoolClass) => schoolClass.id),
    });
    setFieldError("");
    setSaveError("");
    setIsOpen(true);
    window.requestAnimationFrame(() => dialogRef.current?.showModal());
  };

  const closeDialog = () => {
    if (dialogRef.current?.open) dialogRef.current.close();
    setIsOpen(false);
  };

  const toggleClass = (classId) => {
    setForm((current) => ({
      ...current,
      classIds: current.classIds.includes(classId)
        ? current.classIds.filter((id) => id !== classId)
        : [...current.classIds, classId],
    }));
  };

  const saveTeacher = async (event) => {
    event.preventDefault();
    setFieldError("");
    setSaveError("");
    const payload = { ...form };
    const schema = editingTeacher ? teacherUpdateSchema : teacherCreateSchema;
    if (editingTeacher) delete payload.password;
    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      setFieldError(parsed.error.issues[0]?.message || "Check the entered details.");
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch(editingTeacher ? `/api/teachers/${editingTeacher.id}` : "/api/teachers", {
        method: editingTeacher ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save teacher.");
      await queryClient.invalidateQueries({ queryKey: ["teachers"] });
      closeDialog();
    } catch (caughtError) {
      setSaveError(caughtError.message || "Could not save teacher.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <AppShell>
      <section className="page-stack">
        <header className="page-heading-card">
          <div><p className="eyebrow compact">People & access</p><h1>Teacher directory</h1><p>Manage staff accounts and the classes they support.</p></div>
          {user?.role === "ADMIN" && <div className="class-heading-actions"><SchoolRoutineSetupButton label="Complete Classes 1–8 setup" /><button type="button" className="action-button" onClick={openCreate}><Plus size={16} aria-hidden="true" /> Add teacher</button></div>}
        </header>

        {user && user.role !== "ADMIN" ? <p className="state-message" role="alert">Only school administrators can manage teacher accounts.</p> : null}
        {user?.role === "ADMIN" && isPending ? <p className="state-message" role="status">Loading teacher directory…</p> : null}
        {user?.role === "ADMIN" && isError ? <p className="state-message state-message--error" role="alert">{error.message}</p> : null}
        {user?.role === "ADMIN" && !isPending && !isError && teachers.length === 0 && <p className="state-message"><Users size={18} aria-hidden="true" /> No teacher accounts have been added yet.</p>}

        {teachers.length > 0 && user?.role === "ADMIN" && (
          <div className="directory-table overflow-x-auto">
            <table className="data-table">
              <thead><tr><th>Teacher</th><th>Employee ID</th><th>Contact</th><th>Assigned classes</th><th><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>{teachers.map((teacher) => (
                <tr key={teacher.id}>
                  <td><strong>{teacher.user.name}</strong><span className="table-secondary">{teacher.user.email}</span></td>
                  <td>{teacher.employeeId}</td>
                  <td>{teacher.phone || "—"}</td>
                  <td>{teacher.assignedClasses.length ? teacher.assignedClasses.map((schoolClass) => schoolClass.name).join(", ") : "Not assigned"}</td>
                  <td className="text-right"><button type="button" className="quiet-button" onClick={() => openEdit(teacher)}>Edit details</button></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>

      <dialog ref={dialogRef} className="form-dialog" onCancel={(event) => { event.preventDefault(); closeDialog(); }} onClose={() => setIsOpen(false)} role="dialog" aria-modal="true" aria-labelledby="teacher-dialog-title">
        {isOpen && <form onSubmit={saveTeacher} className="dialog-content">
          <header className="dialog-heading"><div><p className="eyebrow compact">School staff</p><h2 id="teacher-dialog-title">{editingTeacher ? "Edit teacher" : "Add a teacher"}</h2></div><button type="button" className="icon-button" onClick={closeDialog} aria-label="Close form"><X size={17} /></button></header>
          <div className="form-grid">
            <label>Full name<input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} autoComplete="name" /></label>
            <label>Work email<input required type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} autoComplete="email" /></label>
            {!editingTeacher && <label>Initial password<input required type="password" minLength={8} value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} autoComplete="new-password" /><small>Share this securely with the teacher and ask them to change it.</small></label>}
            <label>Employee ID<input required value={form.employeeId} onChange={(event) => setForm({ ...form, employeeId: event.target.value })} /></label>
            <label>Phone<input type="tel" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} autoComplete="tel" /></label>
            <label>Specialization<input value={form.specialization} onChange={(event) => setForm({ ...form, specialization: event.target.value })} /></label>
          </div>
          <fieldset className="class-assignment"><legend>Assigned classes</legend>
            {classes.length ? classes.map((schoolClass) => <label key={schoolClass.id}><input type="checkbox" checked={form.classIds.includes(schoolClass.id)} onChange={() => toggleClass(schoolClass.id)} />{schoolClass.name}</label>) : <p className="muted-copy">Add classes before assigning a teacher.</p>}
          </fieldset>
          {(fieldError || saveError) && <p className="form-error" role="alert">{fieldError || saveError}</p>}
          <footer className="dialog-actions"><button type="button" className="secondary-button" onClick={closeDialog}>Cancel</button><button type="submit" className="action-button" disabled={isSaving}><Save size={15} aria-hidden="true" />{isSaving ? "Saving…" : "Save teacher"}</button></footer>
        </form>}
      </dialog>
    </AppShell>
  );
}
