import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Save, Settings2, ShieldCheck } from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import { useAuth } from "@/components/providers/AppProviders";
import { schoolSettingsSchema } from "@/lib/validation";

const defaultSettings = {
  academicYear: "2026-2027",
  attendanceCutoffTime: "10:30",
  allowOfflineAttendance: true,
  requireTeacherConfirmation: true,
  aiConfidenceThreshold: 0.65,
  offlineRetentionDays: 30,
};

async function fetchSettings() {
  const response = await fetch("/api/settings");
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Could not load school settings.");
  return data.settings;
}

export default function SettingsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data, isPending, isError, error } = useQuery({ queryKey: ["school-settings"], queryFn: fetchSettings, enabled: user?.role === "ADMIN" });
  const [form, setForm] = useState(defaultSettings);
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!data) return;
    setForm({
      academicYear: data.academicYear,
      attendanceCutoffTime: data.attendanceCutoffTime,
      allowOfflineAttendance: data.allowOfflineAttendance,
      requireTeacherConfirmation: data.requireTeacherConfirmation,
      aiConfidenceThreshold: data.aiConfidenceThreshold,
      offlineRetentionDays: data.offlineRetentionDays,
    });
  }, [data]);

  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const saveSettings = async (event) => {
    event.preventDefault();
    setFormError("");
    setNotice("");
    const parsed = schoolSettingsSchema.safeParse(form);
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message || "Review the settings and try again.");
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not save school settings.");
      setForm({ ...parsed.data, aiConfidenceThreshold: Number(parsed.data.aiConfidenceThreshold) });
      await queryClient.invalidateQueries({ queryKey: ["school-settings"] });
      setNotice("School settings saved.");
    } catch (caughtError) {
      setFormError(caughtError.message || "Could not save school settings.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <AppShell>
      <section className="page-stack">
        <header className="page-heading-card">
          <div><p className="eyebrow compact">School operations</p><h1>School settings</h1><p>Set the school year and attendance rules for this school.</p></div>
          <span className="profile-status"><ShieldCheck size={14} aria-hidden="true" /> Administrator</span>
        </header>
        {user && user.role !== "ADMIN" ? <p className="state-message" role="alert">Only school administrators can change school settings.</p> : null}
        {user?.role === "ADMIN" && isPending ? <p className="state-message" role="status">Loading school settings…</p> : null}
        {user?.role === "ADMIN" && isError ? <p className="state-message state-message--error" role="alert">{error.message}</p> : null}
        {user?.role === "ADMIN" && !isPending && !isError && <form className="settings-form" onSubmit={saveSettings}>
          <section className="settings-card">
            <div className="settings-section-heading"><span className="section-icon"><Settings2 size={18} aria-hidden="true" /></span><div><h2>Academic calendar</h2><p>These values label reports and set the daily attendance window.</p></div></div>
            <div className="form-grid">
              <label>Academic year<input value={form.academicYear} onChange={(event) => update("academicYear", event.target.value)} placeholder="2026-2027" /></label>
              <label>Attendance cutoff time<input type="time" value={form.attendanceCutoffTime} onChange={(event) => update("attendanceCutoffTime", event.target.value)} /></label>
            </div>
          </section>

          <section className="settings-card">
            <div className="settings-section-heading"><span className="section-icon"><ShieldCheck size={18} aria-hidden="true" /></span><div><h2>Attendance safeguards</h2><p>Keep attendance teacher-reviewed and available when internet access is limited.</p></div></div>
            <label className="setting-switch"><input type="checkbox" checked={form.allowOfflineAttendance} onChange={(event) => update("allowOfflineAttendance", event.target.checked)} /><span><strong>Allow offline attendance</strong><small>Store attendance on this device until it can sync.</small></span></label>
            <label className="setting-switch"><input type="checkbox" checked={form.requireTeacherConfirmation} onChange={(event) => update("requireTeacherConfirmation", event.target.checked)} /><span><strong>Require teacher confirmation</strong><small>AI matches remain suggestions until a teacher reviews and saves them.</small></span></label>
            <div className="form-grid settings-number-fields">
              <label>AI suggestion threshold<input type="number" min="0.5" max="0.95" step="0.01" value={form.aiConfidenceThreshold} onChange={(event) => update("aiConfidenceThreshold", event.target.valueAsNumber)} /><small>Controls when a match is shown as a stronger suggestion. It does not mark attendance automatically.</small></label>
              <label>Offline data retention (days)<input type="number" min="1" max="365" step="1" value={form.offlineRetentionDays} onChange={(event) => update("offlineRetentionDays", event.target.valueAsNumber)} /><small>Retention policy for local school data.</small></label>
            </div>
          </section>

          {(formError || notice) && <p className={formError ? "form-error" : "form-success"} role={formError ? "alert" : "status"}>{formError || notice}</p>}
          <div className="settings-actions"><button type="submit" className="action-button" disabled={isSaving}><Save size={16} aria-hidden="true" />{isSaving ? "Saving…" : "Save settings"}</button></div>
        </form>}
      </section>
    </AppShell>
  );
}
