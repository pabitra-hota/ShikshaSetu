import { Link } from "react-router-dom";
import { ArrowRight, Camera, CheckCircle2, CloudOff, GraduationCap, ShieldCheck, WifiOff } from "lucide-react";
import ThemeToggle from "@/components/theme/ThemeToggle";

const features = [
  {
    icon: Camera,
    title: "A quicker roll call",
    description: "Use the classroom camera to suggest matches, then review and confirm every mark.",
    tone: "attendance-feature-blue",
  },
  {
    icon: WifiOff,
    title: "Ready without signal",
    description: "Attendance can be recorded offline and safely queued on the device.",
    tone: "attendance-feature-sand",
  },
  {
    icon: CloudOff,
    title: "Sync when you’re back",
    description: "Pending records upload when the connection returns, with a clear sync status.",
    tone: "attendance-feature-green",
  },
];

export default function HomePage() {
  return (
    <main className="attendance-landing">
      <header className="landing-header">
        <Link to="/" className="landing-brand" aria-label="ShikshaSetu home">
          <span className="landing-brand-mark"><GraduationCap size={20} /></span>
          <span>ShikshaSetu<small>CLASSROOM ATTENDANCE</small></span>
        </Link>
        <div className="landing-header-actions"><ThemeToggle /><Link to="/login" className="landing-login">Classroom login <ArrowRight size={15} /></Link></div>
      </header>

      <div className="landing-content">
        <section className="landing-hero">
          <div className="landing-hero-copy">
            <div className="eyebrow"><span className="eyebrow-line" /> FOR TEACHERS & SCHOOL TEAMS</div>
            <h1>Attendance that<br />works with <em>your classroom.</em></h1>
            <p>Take attendance, review your class, and keep records moving—even when the internet doesn’t.</p>
            <div className="landing-actions">
              <Link to="/login" className="button-primary">Open the school portal <ArrowRight size={16} /></Link>
              <span><ShieldCheck size={15} /> Teacher-reviewed records</span>
            </div>
          </div>

          <aside className="landing-note">
            <div className="landing-note-icon"><CheckCircle2 size={18} /></div>
            <small>BUILT FOR THE SCHOOL DAY</small>
            <h2>Clear records.<br />Less chasing.</h2>
            <p>One place for class lists, attendance, follow-ups, and reports.</p>
            <div className="landing-note-footer"><span className="connection-dot" /> Offline-ready workflow</div>
          </aside>
        </section>

        <section className="attendance-feature-section">
          <div className="attendance-section-heading">
            <div><div className="eyebrow compact">THE EVERYDAY TOOLS</div><h2>Made for real classroom routines.</h2></div>
            <p>Simple to use on a school computer, tablet, or phone.</p>
          </div>
          <div className="attendance-feature-grid">
            {features.map(({ icon: Icon, title, description, tone }) => (
              <article className="attendance-feature-card" key={title}>
                <span className={`attendance-feature-icon ${tone}`}><Icon size={18} /></span>
                <h3>{title}</h3>
                <p>{description}</p>
              </article>
            ))}
          </div>
        </section>
        <footer className="landing-footer"><span>ShikshaSetu · School attendance workspace</span><span>Designed for dependable, teacher-led record keeping</span></footer>
      </div>
    </main>
  );
}
