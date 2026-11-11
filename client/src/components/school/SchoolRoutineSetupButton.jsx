import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CalendarDays, RefreshCw } from "lucide-react";
import { useAuth } from "@/components/providers/AppProviders";

export default function SchoolRoutineSetupButton({ onComplete, label = "Set up Classes 1–8" }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  if (user?.role !== "ADMIN") return null;

  const prepareRoutine = async () => {
    setIsLoading(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/setup/school-routine", { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not set up the school timetable.");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["teachers"] }),
        queryClient.invalidateQueries({ queryKey: ["school-directory"] }),
      ]);
      await onComplete?.();
      const baseMessage = `${data.classesAdded} classes added · ${data.teachersReady} teacher accounts ready · ${data.studentsAdded} sample students added · ${data.periodsAdded} periods added.`;
      setMessage(data.conflicts?.length ? `${baseMessage} ${data.conflicts.length} occupied periods were kept unchanged.` : baseMessage);
    } catch (caughtError) {
      setError(caughtError.message || "Could not set up the school timetable.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="school-routine-setup">
      <button type="button" className="secondary-button" onClick={prepareRoutine} disabled={isLoading}>
        {isLoading ? <RefreshCw size={15} className="animate-spin" aria-hidden="true" /> : <CalendarDays size={15} aria-hidden="true" />}
        {isLoading ? "Loading school setup…" : label}
      </button>
      {message && <p className="muted-copy" role="status">{message}</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
    </div>
  );
}
