import { useCallback, useEffect, useRef, useState } from "react";
import AppShell from "@/components/layout/AppShell";
import { useAuth } from "@/components/providers/AppProviders";
import { useSync } from "@/hooks/useSync";
import { Download, FileSpreadsheet, Pencil, Printer, RefreshCw, Save, X } from "lucide-react";

const STATUS_OPTIONS = ["PRESENT", "ABSENT", "LATE", "EXCUSED"];

function schoolDateString() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
}

function isValidDateString(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function addDaysToDateString(dateString, days) {
  const date = new Date(`${dateString}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function escapeCsv(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function statusClass(status) {
  if (status === "PRESENT") return "bg-emerald-100 text-emerald-800";
  if (status === "ABSENT") return "bg-rose-100 text-rose-800";
  if (status === "LATE") return "bg-amber-100 text-amber-800";
  return "bg-sky-100 text-sky-800";
}

export default function ReportsPage() {
  const { user } = useAuth();
  const isPrincipal = user?.role === "ADMIN";
  const { pendingCount } = useSync();
  const [classes, setClasses] = useState([]);
  const [classesError, setClassesError] = useState("");
  const [selectedClassId, setSelectedClassId] = useState("");
  const [selectedSectionId, setSelectedSectionId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [viewTab, setViewTab] = useState("STUDENT_SUMMARY");
  const [summary, setSummary] = useState(null);
  const [studentSummaries, setStudentSummaries] = useState([]);
  const [detailedRecords, setDetailedRecords] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [reportError, setReportError] = useState("");
  const [correctionRecord, setCorrectionRecord] = useState(null);
  const [correctionStatus, setCorrectionStatus] = useState("PRESENT");
  const [correctionReason, setCorrectionReason] = useState("");
  const [correctionError, setCorrectionError] = useState("");
  const [isSavingCorrection, setIsSavingCorrection] = useState(false);
  const correctionDialog = useRef(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const today = schoolDateString();
    const requestedStartDate = params.get("startDate");
    const requestedEndDate = params.get("endDate");
    setSelectedClassId(params.get("classId") || "");
    setSelectedSectionId(params.get("sectionId") || "");
    setStartDate(isValidDateString(requestedStartDate) ? requestedStartDate : addDaysToDateString(today, -14));
    setEndDate(isValidDateString(requestedEndDate) ? requestedEndDate : today);
  }, []);

  useEffect(() => {
    let isCurrent = true;
    fetch("/api/classes")
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not load class filters.");
        return data;
      })
      .then((data) => {
        if (!isCurrent) return;
        setClasses(data.classes || []);
        setClassesError("");
      })
      .catch((error) => {
        if (!isCurrent) return;
        setClasses([]);
        setClassesError(error.message || "Could not load class filters.");
      });
    return () => { isCurrent = false; };
  }, []);

  const fetchReport = useCallback(async () => {
    if (!startDate || !endDate) return;
    setIsLoading(true);
    setReportError("");
    try {
      const params = new URLSearchParams({ startDate, endDate });
      if (selectedClassId) params.set("classId", selectedClassId);
      if (selectedSectionId) params.set("sectionId", selectedSectionId);
      const response = await fetch(`/api/reports?${params.toString()}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load attendance reports.");
      setSummary(data.summary);
      setStudentSummaries(data.studentSummaries || []);
      setDetailedRecords(data.detailedRecords || []);
    } catch (error) {
      setReportError(error.message || "Could not load attendance reports.");
      setSummary(null);
      setStudentSummaries([]);
      setDetailedRecords([]);
    } finally {
      setIsLoading(false);
    }
  }, [endDate, selectedClassId, selectedSectionId, startDate]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  const applyPreset = (days) => {
    const end = schoolDateString();
    setStartDate(addDaysToDateString(end, -days));
    setEndDate(end);
  };

  const downloadCsv = (content, filename) => {
    const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8;" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const exportReportCsv = () => {
    const filenameDateRange = `${startDate}_to_${endDate}`;
    if (viewTab === "STUDENT_SUMMARY") {
      const headers = ["RollNumber", "StudentName", "Class", "Section", "Subject", "Teacher", "Period", "TotalSessions", "Present", "Absent", "Late", "Excused", "AttendanceRate%"];
      const rows = studentSummaries.map((student) => [
        escapeCsv(student.rollNumber), escapeCsv(student.name), escapeCsv(student.className), escapeCsv(student.sectionName),
        escapeCsv(student.subject), escapeCsv(student.teacherName), escapeCsv(student.startTime && student.endTime ? `${student.startTime}-${student.endTime}` : "Daily"),
        student.total, student.present, student.absent, student.late, student.excused, escapeCsv(`${student.rate}%`),
      ]);
      downloadCsv([headers.join(","), ...rows.map((row) => row.join(","))].join("\n"), `Student_Attendance_Report_${filenameDateRange}.csv`);
      return;
    }
    const headers = ["Date", "Subject", "Period", "Teacher", "MarkedBy", "RollNumber", "StudentName", "Class", "Section", "Status", "VerificationMethod", "AIConfidence", "SyncStatus"];
    const rows = detailedRecords.map((record) => [
      escapeCsv(record.date), escapeCsv(record.subject), escapeCsv(record.startTime && record.endTime ? `${record.startTime}-${record.endTime}` : "Daily"),
      escapeCsv(record.teacherName), escapeCsv(record.attendanceMarkedBy), escapeCsv(record.rollNumber), escapeCsv(record.studentName),
      escapeCsv(record.className), escapeCsv(record.sectionName), escapeCsv(record.status), escapeCsv(record.method),
      escapeCsv(record.aiConfidence == null ? "—" : `${Math.round(record.aiConfidence * 100)}%`), escapeCsv(record.syncStatus),
    ]);
    downloadCsv([headers.join(","), ...rows.map((row) => row.join(","))].join("\n"), `Attendance_Audit_Log_${filenameDateRange}.csv`);
  };

  const openCorrection = (record) => {
    setCorrectionRecord(record);
    setCorrectionStatus(record.status);
    setCorrectionReason("");
    setCorrectionError("");
    correctionDialog.current?.showModal();
  };

  const submitCorrection = async (event) => {
    event.preventDefault();
    if (!correctionRecord) return;
    setIsSavingCorrection(true);
    setCorrectionError("");
    try {
      const response = await fetch(`/api/attendance/${correctionRecord.id}/rectify`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newStatus: correctionStatus, reason: correctionReason }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not correct this record.");
      correctionDialog.current?.close();
      setCorrectionRecord(null);
      await fetchReport();
    } catch (error) {
      setCorrectionError(error.message || "Could not correct this record.");
    } finally {
      setIsSavingCorrection(false);
    }
  };

  const selectedClass = classes.find((schoolClass) => schoolClass.id === selectedClassId);
  const attendancePercentage = summary?.attendancePercentage ?? 0;

  return (
    <AppShell>
      <div className="space-y-6">
        <section className="report-filter-panel bg-white p-5 rounded-3xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-emerald-50 text-emerald-700 text-xs font-bold mb-1 border border-emerald-200">
                <FileSpreadsheet className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{isPrincipal ? "School attendance & corrections" : "Your attendance records"}</span>
              </div>
              <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">{isPrincipal ? "Attendance reports & rectification" : "My attendance reports"}</h1>
              <p className="mt-1 text-xs text-slate-500">{isPrincipal ? "Review school-wide attendance and record reasoned corrections." : "Only attendance marked by your account in your assigned classes is shown."}</p>
            </div>
            <div className="flex items-center gap-2 no-print">
              {isPrincipal && <button type="button" onClick={() => setViewTab("AUDIT_LOG")} className="px-3.5 py-2 rounded-xl border border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100 font-semibold text-xs">Rectify attendance</button>}
              <button type="button" onClick={() => window.print()} className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs flex items-center gap-1.5 transition-all">
                <Printer className="w-4 h-4" aria-hidden="true" /><span>Print</span>
              </button>
              <button type="button" onClick={exportReportCsv} disabled={!summary} className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1.5 transition-all shadow-xs disabled:opacity-50">
                <Download className="w-4 h-4" aria-hidden="true" /><span>Export CSV</span>
              </button>
            </div>
          </div>

          <div className="space-y-3 pt-2 border-t border-slate-100 no-print">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Date range:</span>
              <button type="button" onClick={() => applyPreset(0)} className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold">Today</button>
              <button type="button" onClick={() => applyPreset(7)} className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold">Past 7 days</button>
              <button type="button" onClick={() => applyPreset(30)} className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold">Past 30 days</button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider">Start date<input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} className="mt-1 w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800" /></label>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider">End date<input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} className="mt-1 w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800" /></label>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider">Class<select value={selectedClassId} onChange={(event) => { setSelectedClassId(event.target.value); setSelectedSectionId(""); }} className="mt-1 w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800"><option value="">All classes</option>{classes.map((schoolClass) => <option key={schoolClass.id} value={schoolClass.id}>{schoolClass.name}</option>)}</select></label>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider">Section<select value={selectedSectionId} disabled={!selectedClassId} onChange={(event) => setSelectedSectionId(event.target.value)} className="mt-1 w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 disabled:opacity-50"><option value="">All sections</option>{selectedClass?.sections?.map((section) => <option key={section.id} value={section.id}>{section.name}</option>)}</select></label>
            </div>
          </div>
        </section>

        {classesError && <p className="state-message state-message--error" role="alert">{classesError}</p>}
        {pendingCount > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-xs text-amber-900" role="status">
            <strong>Offline notice:</strong> {pendingCount} attendance batch(es) are waiting to sync. Reports include server-confirmed records only.
          </div>
        )}
        {reportError && <p className="state-message state-message--error" role="alert">{reportError}</p>}

        <section className="report-metrics grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4" aria-label="Attendance report summary">
          {[
            ["Total records", summary?.totalRecords ?? 0, "text-slate-500", "text-slate-900"],
            ["Present", summary?.present ?? 0, "text-emerald-600", "text-emerald-700"],
            ["Absent", summary?.absent ?? 0, "text-rose-500", "text-rose-600"],
            ["Late / excused", (summary?.late ?? 0) + (summary?.excused ?? 0), "text-amber-500", "text-amber-600"],
            ["Attendance rate", `${attendancePercentage}%`, "text-emerald-800", "text-emerald-800"],
          ].map(([label, value, labelTone, valueTone]) => (
            <article key={label} className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
              <p className={`text-[11px] font-bold uppercase tracking-wider ${labelTone}`}>{label}</p>
              <p className={`text-2xl sm:text-3xl font-extrabold mt-1 ${valueTone}`}>{isLoading ? "…" : value}</p>
            </article>
          ))}
        </section>

        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-2 no-print" role="tablist" aria-label="Report views">
          <button type="button" role="tab" aria-selected={viewTab === "STUDENT_SUMMARY"} onClick={() => setViewTab("STUDENT_SUMMARY")} className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${viewTab === "STUDENT_SUMMARY" ? "bg-slate-900 text-white shadow-xs" : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"}`}>Student summary</button>
          <button type="button" role="tab" aria-selected={viewTab === "AUDIT_LOG"} onClick={() => setViewTab("AUDIT_LOG")} className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${viewTab === "AUDIT_LOG" ? "bg-slate-900 text-white shadow-xs" : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"}`}>Daily attendance log</button>
        </div>

        <section className="report-table-shell bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
          {isLoading ? <div className="py-16 text-center text-xs text-slate-400"><RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-emerald-500" aria-hidden="true" />Loading report…</div>
            : viewTab === "STUDENT_SUMMARY" ? (
              <div className="overflow-x-auto"><table className="report-table w-full min-w-[1120px] text-left border-collapse text-xs sm:text-sm">
                <thead><tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase text-[11px] tracking-wider"><th className="py-3 px-4">Roll</th><th className="py-3 px-4">Student</th><th className="py-3 px-4">Class &amp; section</th><th className="py-3 px-4">Subject / period</th><th className="py-3 px-4">Teacher</th><th className="py-3 px-4">Sessions</th><th className="py-3 px-4">Present</th><th className="py-3 px-4">Absent</th><th className="py-3 px-4">Late / excused</th><th className="py-3 px-4 text-right">Rate</th></tr></thead>
                <tbody className="divide-y divide-slate-100">{studentSummaries.map((student) => <tr key={student.summaryKey} className="report-row"><td className="py-3 px-4 font-extrabold text-slate-900">#{student.rollNumber}</td><td className="py-3 px-4"><strong className="block text-slate-900">{student.name}</strong><span className="text-[11px] text-slate-400">{student.schoolStudentId}</span></td><td className="py-3 px-4 font-semibold text-slate-700">{student.className} · {student.sectionName}</td><td className="py-3 px-4"><strong className="block text-slate-800">{student.subject}</strong><span className="text-[11px] text-slate-500">{student.startTime && student.endTime ? `${student.startTime}–${student.endTime}` : "Legacy daily record"}</span></td><td className="py-3 px-4 text-slate-600">{student.teacherName}</td><td className="py-3 px-4 text-slate-600">{student.total}</td><td className="py-3 px-4 font-bold text-emerald-700">{student.present}</td><td className="py-3 px-4 font-bold text-rose-600">{student.absent}</td><td className="py-3 px-4 text-amber-600">{student.late + student.excused}</td><td className="py-3 px-4 text-right"><span className={`font-extrabold px-2.5 py-1 rounded-lg ${statusClass(student.rate >= 80 ? "PRESENT" : student.rate >= 65 ? "LATE" : "ABSENT")}`}>{student.rate}%</span></td></tr>)}</tbody>
              </table></div>
            ) : (
              <div className="overflow-x-auto"><table className="report-table w-full min-w-[1380px] text-left border-collapse text-xs sm:text-sm">
                <thead><tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase text-[11px] tracking-wider"><th className="py-3 px-4">Date</th><th className="py-3 px-4">Subject / period</th><th className="py-3 px-4">Assigned teacher</th><th className="py-3 px-4">Marked by</th><th className="py-3 px-4">Roll</th><th className="py-3 px-4">Student</th><th className="py-3 px-4">Class &amp; section</th><th className="py-3 px-4">Status</th><th className="py-3 px-4">Method</th><th className="py-3 px-4">Corrections</th>{isPrincipal && <th className="py-3 px-4 text-right">Action</th>}</tr></thead>
                <tbody className="divide-y divide-slate-100">{detailedRecords.map((record) => <tr key={record.id} className="report-row"><td className="py-3 px-4 font-bold text-slate-900">{record.date}</td><td className="py-3 px-4"><strong className="block text-slate-800">{record.subject}</strong><span className="text-[11px] text-slate-500">{record.startTime && record.endTime ? `${record.startTime}–${record.endTime}` : "Legacy daily record"}</span></td><td className="py-3 px-4 text-slate-600">{record.teacherName}</td><td className="py-3 px-4 text-slate-600"><span>{record.attendanceMarkedBy}</span>{record.attendanceMarkedAt && <small className="block text-[11px]">{new Date(record.attendanceMarkedAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" })}</small>}</td><td className="py-3 px-4 font-extrabold text-slate-800">#{record.rollNumber}</td><td className="py-3 px-4 font-bold text-slate-900">{record.studentName}</td><td className="py-3 px-4 text-slate-600">{record.className} · {record.sectionName}</td><td className="py-3 px-4"><span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${statusClass(record.status)}`}>{record.status}</span></td><td className="py-3 px-4 text-slate-600">{record.method?.replaceAll("_", " ") || "—"}{record.aiConfidence != null && <span className="text-[11px] text-emerald-700 ml-1 font-semibold">({Math.round(record.aiConfidence * 100)}%)</span>}</td><td className="py-3 px-4 text-slate-600">{record.corrections?.length ? <span title={record.corrections.map((correction) => `${correction.previousStatus} → ${correction.newStatus} by ${correction.correctedBy}: ${correction.reason}`).join("\n")}>{record.corrections.length} logged</span> : "—"}</td>{isPrincipal && <td className="py-3 px-4 text-right"><button type="button" onClick={() => openCorrection(record)} className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 font-semibold text-amber-900 hover:bg-amber-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600"><Pencil size={14} aria-hidden="true" />Correct</button></td>}</tr>)}</tbody>
              </table></div>
            )}
          {!isLoading && !reportError && detailedRecords.length === 0 && studentSummaries.length === 0 && <p className="px-5 py-12 text-center text-sm text-slate-500">{selectedClass ? `No attendance records or active students were found in ${selectedClass.name} for this date range. Add students to this class, then mark attendance to build its report.` : "No attendance records or active students were found for this date range."}</p>}
        </section>
      </div>

      <dialog ref={correctionDialog} className="form-dialog" onCancel={(event) => { event.preventDefault(); correctionDialog.current?.close(); }} onClose={() => setCorrectionRecord(null)} aria-labelledby="rectification-title">
        {correctionRecord && <form onSubmit={submitCorrection} className="dialog-content">
          <header className="dialog-heading"><div><p className="eyebrow compact">Principal action · audit logged</p><h2 id="rectification-title">Correct attendance</h2><p className="muted-copy">{correctionRecord.studentName} · {correctionRecord.className} {correctionRecord.sectionName} · {correctionRecord.date}</p></div><button type="button" className="icon-button" onClick={() => correctionDialog.current?.close()} aria-label="Close correction form"><X size={17} aria-hidden="true" /></button></header>
          <label>Current status<input readOnly value={correctionRecord.status} /></label>
          <label>Correct status<select required value={correctionStatus} onChange={(event) => setCorrectionStatus(event.target.value)}>{STATUS_OPTIONS.map((status) => <option key={status} value={status}>{status}</option>)}</select></label>
          <label>Reason for correction<textarea required minLength={5} maxLength={500} rows={3} value={correctionReason} onChange={(event) => setCorrectionReason(event.target.value)} placeholder="For example: attendance sheet was entered against the wrong student" /></label>
          {correctionRecord.corrections?.length > 0 && <section className="rounded-xl border border-slate-200 bg-slate-50 p-3"><h3 className="text-sm font-bold text-slate-800">Previous corrections</h3><ul className="mt-2 space-y-2 text-xs text-slate-600">{correctionRecord.corrections.map((correction) => <li key={correction.id}><strong>{correction.previousStatus} → {correction.newStatus}</strong> · {correction.correctedBy} · {new Date(correction.correctedAt).toLocaleString()}<span className="block">{correction.reason}</span></li>)}</ul></section>}
          {correctionError && <p className="form-error" role="alert">{correctionError}</p>}
          <footer className="dialog-actions"><button type="button" className="secondary-button" onClick={() => correctionDialog.current?.close()}>Cancel</button><button type="submit" className="action-button" disabled={isSavingCorrection || correctionStatus === correctionRecord.status || correctionReason.trim().length < 5}><Save size={15} aria-hidden="true" />{isSavingCorrection ? "Saving correction…" : "Save correction"}</button></footer>
        </form>}
      </dialog>
    </AppShell>
  );
}
