import { useCallback, useEffect, useState } from "react";
import AppShell from "@/components/layout/AppShell";
import { useAuth } from "@/components/providers/AppProviders";
import { useSync } from "@/hooks/useSync";
import { offlineService } from "@/lib/offline/service";
import { RefreshCw, Wifi, WifiOff, Database, CheckCircle2, Clock, Server, FileCheck2, AlertOctagon, RotateCcw } from "lucide-react";
export default function SyncCenterPage() {
  const { user } = useAuth();
  const {
    isOnline,
    isSyncing,
    pendingCount,
    lastSyncTime,
    syncNow
  } = useSync();
  const [queueItems, setQueueItems] = useState([]);
  const [conflicts, setConflicts] = useState([]);
  const [syncHistory, setSyncHistory] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [syncFeedback, setSyncFeedback] = useState(null);
  // Load pending queue from Dexie
  const loadQueue = useCallback(async () => {
    setIsLoading(true);
    try {
      const items = await offlineService.getPendingSyncItems({ userId: user?.id, isAdmin: user?.role === "ADMIN" });
      setQueueItems(items);
      // Check server sync operations history if online
      if (navigator.onLine) {
        const res = await fetch("/api/dashboard");
        if (res.ok) {
          const d = await res.json();
          // We can show last sync info
        }
      }
    } catch (e) {
      console.error("Queue load error:", e);
    } finally {
      setIsLoading(false);
    }
  }, [user]);
  useEffect(() => {
    loadQueue();
  }, [loadQueue]);
  const handleSyncNow = async () => {
    setSyncFeedback("Synchronizing pending batches with central database...");
    const result = await syncNow();
    if (result.success) {
      if (result.conflicts && result.conflicts.length > 0) {
        setConflicts(result.conflicts);
        setSyncFeedback(`Sync completed with ${result.conflicts.length} conflict(s) requiring review!`);
      } else {
        setSyncFeedback(`Successfully synchronized all batches (${result.syncedBatches} batches processed)!`);
      }
    } else {
      setSyncFeedback(`Sync failed: ${result.error || "Network error"}`);
    }
    loadQueue();
    setTimeout(() => setSyncFeedback(null), 6000);
  };
  // Resolve Conflict Handler
  const resolveConflict = async (conflict, chosenStatus) => {
    try {
      // Post resolution correction to API
      const res = await fetch("/api/attendance", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          sectionId: conflict.sectionId,
          date: conflict.date,
          records: [{
            studentId: conflict.studentId,
            sectionId: conflict.sectionId,
            date: conflict.date,
            status: chosenStatus,
            verificationMethod: "TEACHER_OVERRIDE",
            clientRecordedAt: new Date().toISOString(),
            remarks: `Conflict resolved by teacher: chose ${chosenStatus}`
          }]
        })
      });
      if (res.ok) {
        setConflicts(prev => prev.filter(c => c.studentId !== conflict.studentId));
        alert(`Resolved conflict for ${conflict.studentName} as ${chosenStatus}`);
      }
    } catch (err) {
      alert("Error resolving conflict: " + err.message);
    }
  };
  return <AppShell><div className="space-y-6"><div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs space-y-3"><div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"><div><div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-sky-50 text-sky-700 text-xs font-bold mb-1 border border-sky-200"><Server className="w-3.5 h-3.5"></Server><span>{"Edge Synchronization Architecture"}</span></div><h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">{"Dedicated Synchronization Center"}</h1><p className="text-xs text-slate-500 mt-0.5">{"Manage offline outbox queues, idempotency tokens, and two-way conflict resolution."}</p></div><button onClick={handleSyncNow} disabled={isSyncing || !isOnline} className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-md shadow-emerald-600/20 disabled:opacity-50 transition-all cursor-pointer"><RefreshCw className={`w-4 h-4 ${isSyncing ? "animate-spin" : ""}`}></RefreshCw><span>{isSyncing ? "Synchronizing..." : `Sync Now (${pendingCount} Queued)`}</span></button></div></div>{syncFeedback && <div className={`p-4 rounded-2xl text-xs sm:text-sm font-semibold flex items-center gap-2.5 ${syncFeedback.includes("failed") ? "bg-rose-50 border border-rose-200 text-rose-800" : syncFeedback.includes("conflict") ? "bg-amber-50 border border-amber-200 text-amber-900" : "bg-emerald-50 border border-emerald-200 text-emerald-800"}`}><CheckCircle2 className="w-5 h-5 shrink-0"></CheckCircle2><span>{syncFeedback}</span></div>}<div className="grid grid-cols-1 sm:grid-cols-3 gap-4"><div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-2"><div className="flex items-center justify-between"><span className="text-xs font-bold text-slate-500 uppercase tracking-wider">{"Network Link"}</span>{isOnline ? <Wifi className="w-4 h-4 text-emerald-600"></Wifi> : <WifiOff className="w-4 h-4 text-amber-600"></WifiOff>}</div><div><p className="text-base font-extrabold text-slate-900">{isOnline ? "Connected to Internet" : "Offline / Cellular Low"}</p><p className="text-[11px] text-slate-500">{isOnline ? "Auto-sync enabled on change" : "Local queues preserved safely"}</p></div></div><div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-2"><div className="flex items-center justify-between"><span className="text-xs font-bold text-slate-500 uppercase tracking-wider">{"Local Dexie Store"}</span><Database className="w-4 h-4 text-sky-600"></Database></div><div><p className="text-base font-extrabold text-slate-900">{"IndexedDB Active"}</p><p className="text-[11px] text-slate-500">{"Encrypted client database on this device"}</p></div></div><div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-2"><div className="flex items-center justify-between"><span className="text-xs font-bold text-slate-500 uppercase tracking-wider">{"Central Server"}</span><Server className="w-4 h-4 text-emerald-600"></Server></div><div><p className="text-base font-extrabold text-slate-900">{"PostgreSQL Schema"}</p><p className="text-[11px] text-slate-500">{"Idempotency key enforcement active"}</p></div></div></div>{conflicts.length > 0 && <div className="bg-amber-50/70 border border-amber-300 rounded-3xl p-5 shadow-xs space-y-4"><div className="flex items-start gap-3"><AlertOctagon className="w-6 h-6 text-amber-600 shrink-0 mt-0.5"></AlertOctagon><div><h2 className="text-base font-bold text-amber-950">{conflicts.length}{" Attendance Conflict(s) Detected"}</h2><p className="text-xs text-amber-800 mt-0.5">{"The central server has attendance records modified after your offline capture. Review each record and decide which status to uphold."}</p></div></div><div className="divide-y divide-amber-200/80 bg-white rounded-2xl border border-amber-200 overflow-hidden text-xs">{conflicts.map((c, idx) => <div key={c.attendanceId} className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"><div><div className="flex items-center gap-2"><span className="font-extrabold text-slate-900">{c.studentName}</span><span className="text-slate-500 font-semibold">{"(Roll #"}{c.rollNumber}{")"}</span><span className="text-slate-400 font-medium">{"\u2022 Date: "}{c.date}</span></div><div className="mt-1 flex items-center gap-3 text-[11px]"><span className="text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200 font-semibold">{"Server: "}{c.serverStatus}</span><span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 font-semibold">{"Local Offline: "}{c.localStatus}</span><span className="text-slate-400">{c.reason}</span></div></div><div className="flex items-center gap-2 self-end sm:self-auto"><button onClick={() => resolveConflict(c, c.localStatus)} className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold transition-all">{"Keep Local ("}{c.localStatus}{")"}</button><button onClick={() => resolveConflict(c, c.serverStatus)} className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold transition-all">{"Keep Server ("}{c.serverStatus}{")"}</button></div></div>)}</div></div>}<div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden"><div className="p-5 border-b border-slate-100 flex items-center justify-between"><div><h2 className="text-base font-bold text-slate-900 flex items-center gap-2"><FileCheck2 className="w-5 h-5 text-emerald-600"></FileCheck2><span>{"Pending Outbox Operations Queue"}</span></h2><p className="text-xs text-slate-500">{"Attendance sessions created on this device awaiting server validation and confirmation."}</p></div><button onClick={loadQueue} className="p-1.5 text-slate-500 hover:text-slate-800 rounded-lg hover:bg-slate-100" title="Refresh Queue"><RotateCcw className="w-4 h-4"></RotateCcw></button></div>{isLoading ? <div className="py-12 text-center text-xs text-slate-400"><RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-emerald-500"></RefreshCw>{"Loading outbox queue..."}</div> : queueItems.length === 0 ? <div className="py-12 text-center text-xs text-slate-500 space-y-1"><CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-1"></CheckCircle2><p className="font-bold text-slate-800">{"All local operations are synchronized!"}</p><p className="text-slate-400">{"There are no pending attendance batches on this device."}</p></div> : <div className="overflow-x-auto text-xs sm:text-sm"><table className="w-full text-left border-collapse"><thead><tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase text-[11px] tracking-wider"><th className="py-3 px-4">{"Operation ID (Idempotency)"}</th><th className="py-3 px-4">{"Captured Time"}</th><th className="py-3 px-4">{"Records Count"}</th><th className="py-3 px-4">{"Queue State"}</th><th className="py-3 px-4">{"Retries"}</th></tr></thead><tbody className="divide-y divide-slate-100">{queueItems.map(item => <tr key={item.operationId} className="hover:bg-slate-50/70"><td className="py-3 px-4 font-mono font-bold text-slate-800">{item.operationId}</td><td className="py-3 px-4 text-slate-600">{new Date(item.timestamp).toLocaleString("en-IN")}</td><td className="py-3 px-4 font-bold text-slate-900">{item.records?.length ?? 0}{" students"}</td><td className="py-3 px-4"><span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold ${item.status === "QUEUED" ? "bg-amber-100 text-amber-800" : item.status === "SYNCING" ? "bg-sky-100 text-sky-800" : item.status === "FAILED" ? "bg-rose-100 text-rose-800" : "bg-purple-100 text-purple-800"}`}><Clock className="w-3 h-3"></Clock>{item.status}</span>{item.lastError && <p className="text-[10px] text-rose-600 mt-0.5">{item.lastError}</p>}</td><td className="py-3 px-4 text-slate-500 font-semibold">{item.retryCount}</td></tr>)}</tbody></table></div>}</div></div></AppShell>;
}
