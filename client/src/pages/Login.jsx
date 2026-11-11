import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertCircle,
  ArrowRight,
  GraduationCap,
  Lock,
  Mail,
  ShieldCheck,
  Sparkles,
  UserCheck,
} from "lucide-react";
import ThemeToggle from "@/components/theme/ThemeToggle";

const DEMO_PASSWORD = "Password@123";
const QUICK_FILL_ACCOUNTS = [
  { name: "Meera Ghosh", classLabel: "Class 1 · Section A", email: "meera.ghosh@ruralshiksha.gov.in", role: "TEACHER" },
  { name: "Tapan Das", classLabel: "Class 2 · Section A", email: "tapan.das@ruralshiksha.gov.in", role: "TEACHER" },
  { name: "Suchitra Pal", classLabel: "Class 3 · Section A", email: "suchitra.pal@ruralshiksha.gov.in", role: "TEACHER" },
  { name: "Debashis Mondal", classLabel: "Class 4 · Section A", email: "debashis.mondal@ruralshiksha.gov.in", role: "TEACHER" },
  { name: "Anita Das", classLabel: "Class 5 · Section A", email: "anita.das@ruralshiksha.gov.in", role: "TEACHER" },
  { name: "Mitali Soren", classLabel: "Class 5 · Section B", email: "mitali.soren@ruralshiksha.gov.in", role: "TEACHER" },
  { name: "Vikram Singh", classLabel: "Class 6 · Section A", email: "vikram.singh@ruralshiksha.gov.in", role: "TEACHER" },
  { name: "Ritu Ghosh", classLabel: "Class 7 · Section A", email: "ritu.ghosh@ruralshiksha.gov.in", role: "TEACHER" },
  { name: "Arindam Roy", classLabel: "Class 8 · Section A", email: "arindam.roy@ruralshiksha.gov.in", role: "TEACHER" },
  { name: "Rajesh Sharma", classLabel: "Principal · Admin", email: "admin@ruralshiksha.gov.in", role: "ADMIN" },
];

export default function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [selectedDemoEmail, setSelectedDemoEmail] = useState("");

  const handleLogin = async (event) => {
    event.preventDefault();
    setErrorMsg(null);
    setIsLoading(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Login failed");
      if (typeof window !== "undefined") {
        localStorage.setItem("shikshasetu_user", JSON.stringify(data.user));
      }
      navigate("/dashboard");
      } catch (error) {
      setErrorMsg(error.message || "An unexpected error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  const setDemoCredentials = (account) => {
    setEmail(account.email);
    setPassword(DEMO_PASSWORD);
    setSelectedDemoEmail(account.email);
    setErrorMsg(null);
  };

  return (
    <div className="login-page min-h-screen flex flex-col justify-center px-4 py-12 sm:px-6 lg:px-8">
      <div className="login-theme-control"><ThemeToggle /></div>
      <div className="mx-auto w-full max-w-md text-center">
        <div className="login-brand-mark inline-flex p-3 mb-4 rounded-2xl border shadow-xl">
          <GraduationCap className="h-10 w-10" aria-hidden="true" />
        </div>
        <h1 className="login-brand-title text-3xl font-extrabold tracking-tight">ShikshaSetu</h1>
        <p className="login-brand-subtitle mt-1 text-sm font-medium">AI Rural School Attendance System · PWA Offline-First</p>
      </div>

      <main className="mx-auto mt-8 w-full max-w-xl">
        <section className="login-card rounded-3xl border px-6 py-8 shadow-2xl sm:px-10">
          <div className="mb-6">
            <h2 className="login-card-title text-lg font-bold">Sign in to your classroom</h2>
            <p className="login-card-copy mt-1 text-xs">Enter your authorized school credentials to record and manage attendance.</p>
          </div>

          {errorMsg && (
            <div className="login-error mb-5 flex items-start gap-2 rounded-xl border p-3 text-xs" role="alert">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{errorMsg}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <label className="login-field">
              <span>Official email</span>
              <span className="login-input-wrap">
                <Mail className="h-4 w-4" aria-hidden="true" />
                <input
                  id="school-email"
                  type="email"
                  autoComplete="username"
                  required
                  value={email}
                  onChange={(event) => { setEmail(event.target.value); setSelectedDemoEmail(""); }}
                  placeholder="teacher@ruralshiksha.gov.in"
                />
              </span>
            </label>
            <label className="login-field">
              <span>Password</span>
              <span className="login-input-wrap">
                <Lock className="h-4 w-4" aria-hidden="true" />
                <input
                  id="school-password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(event) => { setPassword(event.target.value); setSelectedDemoEmail(""); }}
                  placeholder="Enter your password"
                />
              </span>
            </label>
            <button type="submit" disabled={isLoading} className="login-submit w-full">
              <span>{isLoading ? "Signing in…" : "Access Classroom"}</span>
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </form>

          <section className="quick-fill-section mt-6 border-t pt-5" aria-labelledby="quick-fill-heading">
            <h3 id="quick-fill-heading" className="quick-fill-heading mb-3 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider">
              <Sparkles className="h-3 w-3" aria-hidden="true" />
              Demo Quick-Fill Accounts
            </h3>
            <div className="quick-fill-grid">
              {QUICK_FILL_ACCOUNTS.map((account) => {
                const isPrincipal = account.role === "ADMIN";
                const Icon = isPrincipal ? ShieldCheck : UserCheck;
                return (
                  <button
                    type="button"
                    key={account.email}
                    aria-pressed={selectedDemoEmail === account.email && email === account.email}
                    onClick={() => setDemoCredentials(account)}
                    className={`quick-fill-account${isPrincipal ? " quick-fill-account--principal" : ""}`}
                  >
                    <span className="quick-fill-account-copy">
                      <span className="quick-fill-name"><Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />{account.name}</span>
                      <span className="quick-fill-role">{account.classLabel}</span>
                      <span className="quick-fill-email">{account.email}</span>
                    </span>
                    <span className="quick-fill-action">Fill</span>
                  </button>
                );
              })}
            </div>
            <p className="quick-fill-note">Choose an account to fill the sign-in form.</p>
          </section>
        </section>
        <p className="login-footer mt-4 text-center text-xs">Gram Panchayat Model School, Sundarpur · Bolpur Block, Birbhum</p>
      </main>
    </div>
  );
}
