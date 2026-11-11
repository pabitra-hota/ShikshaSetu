import { Link } from "react-router-dom";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, CalendarDays, CircleUserRound, Phone, ShieldCheck, Users } from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import { useAuth } from "@/components/providers/AppProviders";

async function fetchStudent(id) {
  const response = await fetch(`/api/students/${encodeURIComponent(id)}`);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Could not load student record.");
  return data.student;
}

export default function StudentProfilePage() {
  const { user } = useAuth();
  const { id } = useParams();
  const { data: student, isPending, isError, error } = useQuery({
    queryKey: ["student", user?.id, id],
    queryFn: () => fetchStudent(id),
    enabled: Boolean(id && user?.id),
  });

  return (
    <AppShell>
      <section className="page-stack">
        <Link to="/students" className="back-link"><ArrowLeft size={16} aria-hidden="true" /> Back to students</Link>
        {isPending ? <p className="state-message" role="status">Loading student record…</p> : null}
        {isError ? <p className="state-message state-message--error" role="alert">{error.message}</p> : null}
        {student && (
          <>
            <header className="profile-header">
              <span className="profile-avatar"><CircleUserRound size={28} aria-hidden="true" /></span>
              <div className="min-w-0 flex-1">
                <p className="eyebrow compact">Student profile</p>
                <h1>{student.name}</h1>
                <p>{student.studentId} · Roll {student.rollNumber} · {student.class?.name || student.className || "Class not assigned"}</p>
              </div>
              <span className="profile-status"><ShieldCheck size={14} aria-hidden="true" /> {student.status || "ACTIVE"}</span>
            </header>

            <div className="profile-grid">
              <section className="profile-card">
                <h2>Attendance summary</h2>
                <div className="profile-stat-grid">
                  <div><span>Recorded days</span><strong>{student.attendanceStats?.total ?? 0}</strong></div>
                  <div><span>Present</span><strong>{student.attendanceStats?.present ?? 0}</strong></div>
                  <div><span>Attendance rate</span><strong>{student.attendanceStats?.rate ?? 0}%</strong></div>
                </div>
                <h3><CalendarDays size={15} aria-hidden="true" /> Recent attendance</h3>
                {student.attendances?.length ? (
                  <ul className="profile-attendance-list">
                    {student.attendances.map((record) => (
                      <li key={record.id}>
                        <span>{new Date(record.date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</span>
                        <span className={`attendance-status attendance-status--${record.status.toLowerCase()}`}>{record.status}</span>
                      </li>
                    ))}
                  </ul>
                ) : <p className="muted-copy">No attendance records have been saved yet.</p>}
              </section>

              <section className="profile-card">
                <h2><Users size={17} aria-hidden="true" /> Student details</h2>
                <dl className="profile-details">
                  <div><dt>Section</dt><dd>{student.enrollments?.[0]?.section?.name || student.sectionName || "—"}</dd></div>
                  <div><dt>Gender</dt><dd>{student.gender || "—"}</dd></div>
                  <div><dt>Date of birth</dt><dd>{student.dob ? new Date(student.dob).toLocaleDateString("en-IN") : "—"}</dd></div>
                  <div><dt>Guardian</dt><dd>{student.guardianName || "—"}</dd></div>
                  <div><dt>Guardian phone</dt><dd>{student.guardianPhone ? <a href={`tel:${student.guardianPhone}`}><Phone size={13} aria-hidden="true" /> {student.guardianPhone}</a> : "—"}</dd></div>
                  <div><dt>Address</dt><dd>{student.address || "—"}</dd></div>
                </dl>
              </section>
            </div>
          </>
        )}
      </section>
    </AppShell>
  );
}
