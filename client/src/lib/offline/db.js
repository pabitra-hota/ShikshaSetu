import Dexie from "dexie";
export class ShikshaSetuOfflineDB extends Dexie {
    students;
    classes;
    sections;
    attendance;
    syncQueue;
    timetableEntries;
    appMetadata;
    constructor() {
        super("ShikshaSetuRuralDB");
        this.version(1).stores({
            students: "id, studentId, classId, sectionId, rollNumber, name",
            classes: "id, name, gradeLevel",
            sections: "id, classId, name",
            attendance: "id, [studentId+date], sectionId, date, syncStatus, clientRecordedAt",
            syncQueue: "operationId, status, timestamp",
            appMetadata: "key",
        });
        this.version(2).stores({
            students: "id, studentId, classId, sectionId, rollNumber, name",
            classes: "id, name, gradeLevel",
            sections: "id, classId, name",
            attendance: "id, [studentId+date], sectionId, date, syncStatus, clientRecordedAt, ownerUserId",
            syncQueue: "operationId, status, timestamp, ownerUserId",
            appMetadata: "key",
        });
        this.version(3).stores({
            students: "id, studentId, classId, sectionId, rollNumber, name",
            classes: "id, name, gradeLevel",
            sections: "id, classId, name",
            attendance: "id, [studentId+date], sectionId, date, syncStatus, clientRecordedAt, ownerUserId",
            syncQueue: "operationId, status, timestamp, ownerUserId",
            timetableEntries: "[ownerUserId+id], ownerUserId, dayOfWeek, teacherId, sectionId",
            appMetadata: "key",
        });
        this.version(4).stores({
            students: "id, studentId, classId, sectionId, rollNumber, name",
            classes: "id, name, gradeLevel",
            sections: "id, classId, name",
            attendance: "id, [studentId+date], sectionId, date, sessionKey, syncStatus, clientRecordedAt, ownerUserId",
            syncQueue: "operationId, status, timestamp, ownerUserId",
            timetableEntries: "[ownerUserId+id], ownerUserId, dayOfWeek, teacherId, sectionId",
            appMetadata: "key",
        }).upgrade(async (transaction) => {
            const attendanceTable = transaction.table("attendance");
            const existingAttendance = await attendanceTable.toArray();
            await attendanceTable.clear();
            if (existingAttendance.length) {
                await attendanceTable.bulkPut(existingAttendance.map((record) => {
                    const sessionKey = record.sessionKey || `legacy:${record.sectionId}:${record.date}`;
                    return { ...record, sessionKey, id: `${sessionKey}:${record.studentId}` };
                }));
            }
            await transaction.table("syncQueue").toCollection().modify((item) => {
                item.legacyDaily = item.legacyDaily ?? !item.timetableEntryId;
                item.records = (item.records || []).map((record) => {
                    const sessionKey = record.sessionKey || `legacy:${record.sectionId}:${record.date}`;
                    return { ...record, sessionKey, id: `${sessionKey}:${record.studentId}` };
                });
            });
        });
    }
}
// Client-only singleton
let dbInstance = null;
export function getOfflineDB() {
    if (typeof window === "undefined") {
        // Return empty mock for SSR safely
        return new ShikshaSetuOfflineDB();
    }
    if (!dbInstance) {
        dbInstance = new ShikshaSetuOfflineDB();
    }
    return dbInstance;
}
