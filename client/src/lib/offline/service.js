import { getOfflineDB } from "./db.js";
import { attendanceSessionKey } from "../attendance/session.js";
// Generate unique device ID stored in localStorage
export function getOrCreateDeviceId(userId) {
    if (typeof window === "undefined")
        return "server-device-id";
    const storageKey = userId ? `shikshasetu_device_id_${userId}` : "shikshasetu_device_id";
    let deviceId = localStorage.getItem(storageKey);
    if (!deviceId) {
        deviceId = `dev_${Math.random().toString(36).substring(2, 9)}_${Date.now()}`;
        localStorage.setItem(storageKey, deviceId);
    }
    return deviceId;
}
// Generate unique operation ID (idempotency key)
export function generateOperationId() {
    return `op_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}
export const offlineService = {
    async ensureRosterOwner(userId) {
        if (!userId) return;
        const db = getOfflineDB();
        await db.transaction("rw", db.students, db.classes, db.sections, db.timetableEntries, db.appMetadata, async () => {
            const owner = await db.appMetadata.get("rosterOwnerId");
            if (owner?.value === userId) return;
            await db.students.clear();
            await db.classes.clear();
            await db.sections.clear();
            await db.timetableEntries.clear();
            await db.appMetadata.put({ key: "rosterOwnerId", value: userId });
        });
    },
    // 1. Cache class roster
    async cacheRoster(students, classes, sections, userId) {
        const db = getOfflineDB();
        await db.transaction("rw", db.students, db.classes, db.sections, db.appMetadata, async () => {
            if (userId) {
                const owner = await db.appMetadata.get("rosterOwnerId");
                if (owner?.value !== userId) return;
            }
            await db.students.clear();
            await db.classes.clear();
            await db.sections.clear();
            await db.students.bulkPut(students);
            await db.classes.bulkPut(classes);
            await db.sections.bulkPut(sections);
            await db.appMetadata.put({ key: "lastRosterSync", value: new Date().toISOString() });
            if (userId) await db.appMetadata.put({ key: "rosterOwnerId", value: userId });
        });
    },
    // 2. Get students by section
    async getStudentsForSection(sectionId) {
        const db = getOfflineDB();
        return await db.students.where("sectionId").equals(sectionId).sortBy("rollNumber");
    },
    // 3. Get all offline classes
    async getClasses() {
        const db = getOfflineDB();
        return await db.classes.toArray();
    },
    async getCachedRoster() {
        if (typeof window === "undefined") return { students: [], classes: [] };
        const db = getOfflineDB();
        const [students, classes, sections] = await Promise.all([
            db.students.toArray(),
            db.classes.toArray(),
            db.sections.toArray(),
        ]);
        return {
            students: students.map((student) => ({
                ...student,
                sectionName: student.sectionName ?? sections.find((section) => section.id === student.sectionId)?.name ?? "",
            })),
            classes: classes.map((schoolClass) => ({
                ...schoolClass,
                sections: sections.filter((section) => section.classId === schoolClass.id),
            })),
        };
    },
    // 4. Get sections for class
    async getSectionsForClass(classId) {
        const db = getOfflineDB();
        return await db.sections.where("classId").equals(classId).toArray();
    },
    async cacheTimetable(entries, userId) {
        if (!userId) return;
        const db = getOfflineDB();
        await db.transaction("rw", db.timetableEntries, db.appMetadata, async () => {
            const owner = await db.appMetadata.get("rosterOwnerId");
            if (owner?.value !== userId) return;
            await db.timetableEntries.clear();
            await db.timetableEntries.bulkPut(entries.map((entry) => ({ ...entry, ownerUserId: userId })));
        });
    },
    async getCachedTimetable(userId) {
        if (!userId) return [];
        const db = getOfflineDB();
        return await db.timetableEntries.where("ownerUserId").equals(userId).sortBy("dayOfWeek");
    },
    // 5. Save attendance locally (offline-first)
    async saveAttendanceSession(params) {
        const db = getOfflineDB();
        const deviceId = getOrCreateDeviceId(params.userId);
        const operationId = generateOperationId();
        const nowIso = new Date().toISOString();
        const sessionKey = attendanceSessionKey({
            timetableEntryId: params.timetableEntryId,
            sectionId: params.sectionId,
            date: params.date,
        });
        const offlineRecords = params.records.map((r) => ({
            id: `${sessionKey}:${r.studentId}`,
            ownerUserId: params.userId ?? null,
            sessionKey,
            timetableEntryId: params.timetableEntryId ?? null,
            studentId: r.studentId,
            studentName: r.studentName,
            rollNumber: r.rollNumber,
            sectionId: params.sectionId,
            date: params.date,
            status: r.status,
            verifiedByAi: r.verifiedByAi,
            aiConfidence: r.aiConfidence ?? null,
            verificationMethod: r.verificationMethod,
            syncStatus: "PENDING_SYNC",
            clientRecordedAt: nowIso,
            serverConfirmedAt: null,
            offlineCreated: params.isOffline,
            remarks: r.remarks ?? null,
        }));
        await db.transaction("rw", db.attendance, db.syncQueue, async () => {
            // Upsert attendance records
            await db.attendance.bulkPut(offlineRecords);
            // Create queued sync operation
            const queueItem = {
                operationId,
                ownerUserId: params.userId ?? null,
                deviceId,
                timestamp: nowIso,
                sessionKey,
                timetableEntryId: params.timetableEntryId ?? null,
                sectionId: params.sectionId,
                date: params.date,
                records: offlineRecords,
                retryCount: 0,
                status: "QUEUED",
                lastError: null,
            };
            await db.syncQueue.put(queueItem);
        });
        return { operationId, count: offlineRecords.length };
    },
    // 6. Get attendance for date & section
    async getAttendanceForDateAndSection(sectionId, date, timetableEntryId) {
        const db = getOfflineDB();
        const sessionKey = attendanceSessionKey({ timetableEntryId, sectionId, date });
        return await db.attendance
            .where("sessionKey")
            .equals(sessionKey)
            .toArray();
    },
    async getOfflineAttendanceSessionInfo(sessionKey, userId) {
        if (!sessionKey || !userId) return { recordCount: 0, pendingCount: 0 };
        const db = getOfflineDB();
        const records = await db.attendance.where("sessionKey").equals(sessionKey).toArray();
        const ownedRecords = records.filter((record) => record.ownerUserId === userId);
        return {
            recordCount: ownedRecords.length,
            pendingCount: ownedRecords.filter((record) => record.syncStatus !== "SYNCED").length,
        };
    },
    // 7. Get pending sync items
    async getPendingSyncItems(scope = {}) {
        const db = getOfflineDB();
        const items = await db.syncQueue.where("status").anyOf("QUEUED", "FAILED", "SYNCING").toArray();
        if (scope.isAdmin) return items;
        if (!scope.userId) return [];
        return items.filter((item) => item.ownerUserId === scope.userId);
    },
    // 8. Mark sync completed
    async markSyncCompleted(operationId, confirmedAt) {
        const db = getOfflineDB();
        const queueItem = await db.syncQueue.get(operationId);
        if (!queueItem)
            return;
        await db.transaction("rw", db.attendance, db.syncQueue, db.appMetadata, async () => {
            for (const rec of queueItem.records) {
                const existing = await db.attendance.get(rec.id);
                if (existing) {
                    existing.syncStatus = "SYNCED";
                    existing.serverConfirmedAt = confirmedAt;
                    await db.attendance.put(existing);
                }
            }
            await db.syncQueue.delete(operationId);
            await db.appMetadata.put({ key: "lastSuccessfulSync", value: confirmedAt });
        });
    },
    // 9. Mark sync failed
    async markSyncFailed(operationId, error) {
        const db = getOfflineDB();
        const queueItem = await db.syncQueue.get(operationId);
        if (queueItem) {
            queueItem.retryCount += 1;
            queueItem.status = "FAILED";
            queueItem.lastError = error;
            await db.syncQueue.put(queueItem);
        }
    },
    // 10. Mark conflict
    async markSyncConflict(operationId, reason) {
        const db = getOfflineDB();
        const queueItem = await db.syncQueue.get(operationId);
        if (queueItem) {
            queueItem.status = "CONFLICT";
            queueItem.lastError = reason;
            await db.syncQueue.put(queueItem);
        }
    },
    // 11. Count pending
    async getPendingCount(scope = {}) {
        const db = getOfflineDB();
        if (scope.isAdmin) return db.syncQueue.count();
        if (!scope.userId) return 0;
        return db.syncQueue.where("ownerUserId").equals(scope.userId).count();
    },
    // 12. Get last sync time
    async getLastSyncTime() {
        const db = getOfflineDB();
        const meta = await db.appMetadata.get("lastSuccessfulSync");
        return meta?.value ?? null;
    },
};
