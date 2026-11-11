import { offlineService } from "@/lib/offline/service";
class SyncEngine {
    isOnline = typeof navigator !== "undefined" ? navigator.onLine : true;
    isSyncing = false;
    listeners = new Set();
    lastError = null;
    lastSyncTime = null;
    currentScope = { userId: null, isAdmin: false };
    constructor() {
        if (typeof window !== "undefined") {
            this.isOnline = navigator.onLine;
            window.addEventListener("online", () => this.handleOnlineStatus(true));
            window.addEventListener("offline", () => this.handleOnlineStatus(false));
            // Periodic check or background sync check
            this.initBackgroundSync();
            this.refreshLastSyncTime();
        }
    }
    async refreshLastSyncTime() {
        this.lastSyncTime = await offlineService.getLastSyncTime();
        this.notify();
    }
    handleOnlineStatus(online) {
        this.isOnline = online;
        this.notify();
        if (online) {
            console.log("📶 Network online detected: auto-triggering background sync");
            this.triggerSync(this.currentScope);
        }
    }
    setScope(scope) {
        this.currentScope = scope ?? { userId: null, isAdmin: false };
        this.notify();
    }
    subscribe(listener) {
        this.listeners.add(listener);
        // Send immediate initial state
        this.getPendingCount(this.currentScope).then((count) => {
            listener({
                isOnline: this.isOnline,
                isSyncing: this.isSyncing,
                pendingCount: count,
                lastSyncTime: this.lastSyncTime,
                lastError: this.lastError,
            });
        });
        return () => {
            this.listeners.delete(listener);
        };
    }
    async notify() {
        const pendingCount = await this.getPendingCount(this.currentScope);
        for (const listener of this.listeners) {
            listener({
                isOnline: this.isOnline,
                isSyncing: this.isSyncing,
                pendingCount,
                lastSyncTime: this.lastSyncTime,
                lastError: this.lastError,
            });
        }
    }
    async getPendingCount(scope = this.currentScope) {
        try {
            return await offlineService.getPendingCount(scope);
        }
        catch {
            return 0;
        }
    }
    async initBackgroundSync() {
        if (typeof window === "undefined" || !("serviceWorker" in navigator))
            return;
        try {
            const reg = await navigator.serviceWorker.ready;
            if ("sync" in reg) {
                await reg.sync.register("sync-attendance");
            }
        }
        catch {
            // Background sync not supported in this browser, fallback to online event listener
        }
    }
    async triggerSync(scope = this.currentScope) {
        if (this.isSyncing) {
            return { success: false, syncedBatches: 0, conflicts: [], error: "Sync already in progress" };
        }
        if (!this.isOnline) {
            return { success: false, syncedBatches: 0, conflicts: [], error: "Device is offline" };
        }
        if (!scope?.userId) {
            return { success: false, syncedBatches: 0, conflicts: [], error: "Sign in before synchronizing attendance" };
        }
        this.isSyncing = true;
        this.lastError = null;
        this.notify();
        let syncedBatches = 0;
        const allConflicts = [];
        try {
            const queue = await offlineService.getPendingSyncItems(scope);
            if (queue.length === 0) {
                this.isSyncing = false;
                this.notify();
                return { success: true, syncedBatches: 0, conflicts: [] };
            }
            for (const item of queue) {
                const payload = {
                    operationId: item.operationId,
                    deviceId: item.deviceId,
                    timestamp: item.timestamp,
                    timetableEntryId: item.timetableEntryId ?? undefined,
                    legacyDaily: item.legacyDaily ?? !item.timetableEntryId,
                    records: item.records.map((r) => ({
                        studentId: r.studentId,
                        markedByUserId: r.ownerUserId ?? undefined,
                        timetableEntryId: r.timetableEntryId ?? item.timetableEntryId ?? undefined,
                        studentName: r.studentName,
                        rollNumber: r.rollNumber,
                        sectionId: r.sectionId,
                        date: r.date,
                        status: r.status,
                        verifiedByAi: r.verifiedByAi,
                        aiConfidence: r.aiConfidence,
                        verificationMethod: r.verificationMethod,
                        clientRecordedAt: r.clientRecordedAt,
                        remarks: r.remarks ?? undefined,
                        offlineCreated: r.offlineCreated,
                    })),
                };
                const res = await fetch("/api/sync", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                });
                if (!res.ok) {
                    const errData = await res.json().catch(() => ({}));
                    const errMsg = errData.error || `HTTP ${res.status}`;
                    await offlineService.markSyncFailed(item.operationId, errMsg);
                    this.lastError = errMsg;
                    continue;
                }
                const data = await res.json();
                if (data.conflicts && data.conflicts.length > 0) {
                    allConflicts.push(...data.conflicts);
                    await offlineService.markSyncConflict(item.operationId, `${data.conflicts.length} conflicting record(s)`);
                }
                else {
                    await offlineService.markSyncCompleted(item.operationId, data.serverConfirmedAt || new Date().toISOString());
                    syncedBatches++;
                }
            }
            this.lastSyncTime = new Date().toISOString();
            return { success: true, syncedBatches, conflicts: allConflicts };
        }
        catch (err) {
            console.error("Sync engine execution failure:", err);
            this.lastError = err?.message || "Network sync failed";
            return { success: false, syncedBatches, conflicts: allConflicts, error: this.lastError ?? undefined };
        }
        finally {
            this.isSyncing = false;
            this.notify();
        }
    }
}
export const syncEngine = new SyncEngine();
