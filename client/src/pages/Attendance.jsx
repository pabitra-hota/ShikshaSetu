import { useEffect, useRef, useState } from "react";
import AppShell from "@/components/layout/AppShell";
import { useAuth } from "@/components/providers/AppProviders";
import { useSync } from "@/hooks/useSync";
import { offlineService } from "@/lib/offline/service";
import { detectAndRecognizeFacesInImage, cropFaceFromImage } from "@/lib/ai/faceMatcher";
import { loadFaceApiModels } from "@/lib/ai/modelLoader";
import { applyAiMatchSuggestion, createReviewItems, hasUnreviewedAttendance, isAttendanceStatus } from "@/lib/attendance/review";
import { Camera, Upload, RefreshCw, CheckCircle2, AlertTriangle, Sparkles, ShieldCheck, Check, ListFilter, Save, CalendarDays, Clock3, BookOpen } from "lucide-react";

function getLocalToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
}

export default function AttendancePage() {
  const { user } = useAuth();
  const isTeacher = user?.role === "TEACHER";
  const {
    isOnline,
    syncNow
  } = useSync();
  // Session selection state
  const [classes, setClasses] = useState([]);
  const [selectedClassId, setSelectedClassId] = useState("");
  const [selectedSectionId, setSelectedSectionId] = useState("");
  const [attendanceDate, setAttendanceDate] = useState("");
  const [scheduledPeriods, setScheduledPeriods] = useState([]);
  const [selectedTimetableEntryId, setSelectedTimetableEntryId] = useState("");
  const [requestedTimetableEntryId, setRequestedTimetableEntryId] = useState("");
  const [isLoadingSchedule, setIsLoadingSchedule] = useState(false);
  const [scheduleError, setScheduleError] = useState("");
  const [mode, setMode] = useState("AI");
  // Roster & Loading
  const [roster, setRoster] = useState([]);
  const [isLoadingRoster, setIsLoadingRoster] = useState(false);
  const [modelsReady, setModelsReady] = useState(false);
  const [modelLoadingText, setModelLoadingText] = useState("Initializing AI Engine...");
  // Camera & Image Capture
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const requestedPeriodApplied = useRef(false);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [capturedImages, setCapturedImages] = useState([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  // Review List (Attendance sheet to confirm)
  const [reviewItems, setReviewItems] = useState([]);
  const [unrecognizedFaces, setUnrecognizedFaces] = useState([]);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  // 1. Load classes & sections on mount (with offline IndexedDB fallback)
  useEffect(() => {
    async function loadClasses() {
      if (!user?.id) return;
      const requestedParams = new URLSearchParams(window.location.search);
      const requestedClassId = requestedParams.get("classId");
      const requestedSectionId = requestedParams.get("sectionId");
      setRequestedTimetableEntryId(requestedParams.get("timetableEntryId") || "");
      const requestedDate = requestedParams.get("date");
      setAttendanceDate(requestedDate && /^\d{4}-\d{2}-\d{2}$/.test(requestedDate) ? requestedDate : getLocalToday());
      try {
        await offlineService.ensureRosterOwner(user.id);
      } catch (error) {
        console.error("Could not prepare the account-specific offline roster:", error);
        return;
      }
      try {
        const res = await fetch("/api/classes");
        if (res.ok) {
          const json = await res.json();
          const availableClasses = json.classes || [];
          setClasses(availableClasses);
          if (availableClasses.length > 0) {
            const requestedClass = availableClasses.find((schoolClass) => schoolClass.id === requestedClassId);
            const classForAttendance = requestedClass || availableClasses.find((schoolClass) => schoolClass.sections?.some((section) => section.id === requestedSectionId)) || availableClasses[0];
            const sectionForAttendance = classForAttendance.sections?.find((section) => section.id === requestedSectionId) || classForAttendance.sections?.[0];
            setSelectedClassId(classForAttendance.id);
            if (sectionForAttendance) setSelectedSectionId(sectionForAttendance.id);
          }
          return;
        }
      } catch {
        // Offline fallback from IndexedDB
      }
      const offlineClasses = await offlineService.getClasses();
      if (offlineClasses.length > 0) {
        const formatted = [];
        for (const c of offlineClasses) {
          const sections = await offlineService.getSectionsForClass(c.id);
          formatted.push({
            id: c.id,
            name: c.name,
            gradeLevel: c.gradeLevel,
            sections: sections.map(s => ({
              id: s.id,
              name: s.name
            }))
          });
        }
        setClasses(formatted);
        if (formatted.length > 0) {
          const requestedClass = formatted.find((schoolClass) => schoolClass.id === requestedClassId);
          const classForAttendance = requestedClass || formatted.find((schoolClass) => schoolClass.sections?.some((section) => section.id === requestedSectionId)) || formatted[0];
          const sectionForAttendance = classForAttendance.sections?.find((section) => section.id === requestedSectionId) || classForAttendance.sections?.[0];
          setSelectedClassId(classForAttendance.id);
          if (sectionForAttendance) setSelectedSectionId(sectionForAttendance.id);
        }
      }
    }
    loadClasses();
    // Preload Face-API AI models in background
    loadFaceApiModels().then(ok => {
      setModelsReady(ok);
      setModelLoadingText(ok ? "AI Models Ready" : "AI Models Failed to Load");
    }).catch(err => {
      console.error("AI Model Preload error:", err);
      setModelLoadingText("AI Model Error");
    });
  }, [user?.id]);
  // Load only periods assigned to the signed-in teacher for the selected school date.
  useEffect(() => {
    if (!user?.id || !attendanceDate) return;
    let cancelled = false;
    async function loadScheduledPeriods() {
      setIsLoadingSchedule(true);
      setScheduleError("");
      try {
        const response = await fetch(`/api/timetable?date=${encodeURIComponent(attendanceDate)}`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not load the scheduled periods.");
        if (cancelled) return;
        const periods = data.entries || [];
        setScheduledPeriods(periods);
        const requestedId = requestedPeriodApplied.current ? "" : requestedTimetableEntryId || new URLSearchParams(window.location.search).get("timetableEntryId");
        requestedPeriodApplied.current = true;
        const selected = periods.find((period) => period.id === requestedId)
          || periods.find((period) => period.id === selectedTimetableEntryId)
          || (isTeacher ? periods[0] : null);
        setSelectedTimetableEntryId(selected?.id || "");
        if (selected) {
          setSelectedClassId(selected.classId);
          setSelectedSectionId(selected.sectionId);
        } else if (isTeacher) {
          setSelectedClassId("");
          setSelectedSectionId("");
          setRoster([]);
          setReviewItems([]);
        }
      } catch (error) {
        const cached = await offlineService.getCachedTimetable(user.id).catch(() => []);
        if (cancelled) return;
        const weekday = new Date(`${attendanceDate}T00:00:00.000Z`).getUTCDay();
        const periods = cached.filter((period) => period.dayOfWeek === weekday);
        const requestedId = requestedPeriodApplied.current ? "" : requestedTimetableEntryId || new URLSearchParams(window.location.search).get("timetableEntryId");
        requestedPeriodApplied.current = true;
        const selected = periods.find((period) => period.id === requestedId)
          || periods.find((period) => period.id === selectedTimetableEntryId)
          || (isTeacher ? periods[0] : null);
        setScheduledPeriods(periods);
        setSelectedTimetableEntryId(selected?.id || "");
        setScheduleError(periods.length ? "Using the timetable saved on this device. Attendance will sync when the connection returns." : error.message || "No saved timetable is available for this date.");
        if (selected) {
          setSelectedClassId(selected.classId);
          setSelectedSectionId(selected.sectionId);
        } else if (isTeacher) {
          setSelectedClassId("");
          setSelectedSectionId("");
          setRoster([]);
          setReviewItems([]);
        }
      } finally {
        if (!cancelled) setIsLoadingSchedule(false);
      }
    }
    loadScheduledPeriods();
    return () => { cancelled = true; };
  }, [attendanceDate, isTeacher, requestedTimetableEntryId, selectedTimetableEntryId, user?.id]);
  // 2. Load the active roster and existing marks for the selected period/date.
  useEffect(() => {
    if (!selectedSectionId || !attendanceDate || (isTeacher && !selectedTimetableEntryId)) return;
    let cancelled = false;
    async function loadSectionRoster() {
      setIsLoadingRoster(true);
      setReviewItems([]);
      try {
        if (navigator.onLine) {
          const res = await fetch(`/api/students?sectionId=${selectedSectionId}&date=${encodeURIComponent(attendanceDate)}`);
          if (res.ok) {
            const json = await res.json();
            const students = json.students || [];
            const attendanceParams = new URLSearchParams({ sectionId: selectedSectionId, date: attendanceDate });
            if (selectedTimetableEntryId) attendanceParams.set("timetableEntryId", selectedTimetableEntryId);
            const attendanceResponse = await fetch(`/api/attendance?${attendanceParams.toString()}`);
            const attendanceData = attendanceResponse.ok ? await attendanceResponse.json() : { records: [] };
            if (cancelled) return;
            setRoster(students);
            setReviewItems(mergeSavedAttendance(students, attendanceData.records || []));
            setIsLoadingRoster(false);
            return;
          }
        }
      } catch {
        // Fallback to IndexedDB
      }
      const offlineStudents = await offlineService.getStudentsForSection(selectedSectionId);
      if (cancelled) return;
      const formatted = offlineStudents.map(s => ({
        id: s.id,
        studentId: s.studentId,
        name: s.name,
        rollNumber: s.rollNumber,
        classId: s.classId,
        sectionId: s.sectionId,
        descriptor: s.descriptor,
        photoUrl: s.photoUrl
      }));
      const cachedAttendance = await offlineService.getAttendanceForDateAndSection(selectedSectionId, attendanceDate, selectedTimetableEntryId || undefined).catch(() => []);
      setRoster(formatted);
      setReviewItems(mergeSavedAttendance(formatted, cachedAttendance));
      setIsLoadingRoster(false);
    }
    loadSectionRoster();
    return () => { cancelled = true; };
  }, [attendanceDate, isTeacher, selectedSectionId, selectedTimetableEntryId]);
  function mergeSavedAttendance(students, records) {
    const recordsByStudent = new Map(records.map((record) => [record.studentId, record]));
    return createReviewItems(students).map((item) => {
      const record = recordsByStudent.get(item.studentId);
      if (!record) return item;
      return {
        ...item,
        status: record.status,
        verifiedByAi: Boolean(record.verifiedByAi),
        aiConfidence: record.aiConfidence ?? null,
        verificationMethod: record.verificationMethod || "MANUAL_ROSTER",
      };
    });
  }
  // Start Camera
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "environment",
          width: {
            ideal: 1280
          },
          height: {
            ideal: 720
          }
        }
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
        setIsCameraActive(true);
      }
    } catch (err) {
      alert("Unable to access camera. Please check camera permissions or upload a classroom photo.");
    }
  };
  // Stop Camera
  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject;
      stream.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
  };
  // Capture Photo from Camera
  const capturePhoto = () => {
    if (!videoRef.current) return;
    const canvas = document.createElement("canvas");
    canvas.width = videoRef.current.videoWidth || 1280;
    canvas.height = videoRef.current.videoHeight || 720;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
    setCapturedImages(prev => [...prev, dataUrl]);
    analyzeClassroomImage(canvas);
  };
  // Upload classroom image
  const handleImageUpload = e => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = event => {
      const dataUrl = event.target?.result;
      setCapturedImages(prev => [...prev, dataUrl]);
      const img = new Image();
      img.onload = () => {
        analyzeClassroomImage(img);
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  };
  // Analyze classroom photo with real Face-API recognition
  const analyzeClassroomImage = async imgSource => {
    setIsAnalyzing(true);
    try {
      // 1. Prepare authorized student references with 128-d biometric vectors
      const authorizedRefs = roster.map(s => ({
        id: s.id,
        name: s.name,
        rollNumber: s.rollNumber,
        descriptor: s.descriptor
      }));
      // 2. Run real face detection & recognition
      const detectedMatches = await detectAndRecognizeFacesInImage(imgSource, authorizedRefs);
      // 3. Update review sheet based on detections
      const updatedReviews = [...reviewItems];
      const unrecognized = [];
      for (const match of detectedMatches) {
        const faceThumb = cropFaceFromImage(imgSource, match.box);
        if (["CONFIRMED", "UNCERTAIN", "DUPLICATE"].includes(match.matchStatus) && match.suggestedStudentId) {
          const index = updatedReviews.findIndex(r => r.studentId === match.suggestedStudentId);
          if (index !== -1) {
            updatedReviews[index] = applyAiMatchSuggestion(updatedReviews[index], match, faceThumb);
          }
        } else {
          // Unknown face detected in classroom
          unrecognized.push({
            thumbnail: faceThumb,
            confidence: match.confidence
          });
        }
      }
      setReviewItems(updatedReviews);
      setUnrecognizedFaces(prev => [...prev, ...unrecognized]);
    } catch (err) {
      console.error("AI Face Recognition error:", err);
      alert("Error analyzing image with Face-API. Falling back to manual verification.");
    } finally {
      setIsAnalyzing(false);
    }
  };
  // Toggle individual student status
  const updateStudentStatus = (studentId, newStatus) => {
    if (!isAttendanceStatus(newStatus)) return;
    setReviewItems(prev => prev.map(item => item.studentId === studentId ? {
      ...item,
      status: newStatus,
      verificationMethod: item.verifiedByAi ? "TEACHER_OVERRIDE" : "MANUAL_ROSTER"
    } : item));
  };
  // Bulk shortcuts are explicit teacher decisions and clear any AI-only suggestion metadata.
  const markAll = status => {
    if (!isAttendanceStatus(status)) return;
    setReviewItems(prev => prev.map(item => ({
      ...item,
      status,
      verifiedByAi: false,
      aiConfidence: null,
      matchFlag: undefined,
      faceThumbnail: undefined,
      verificationMethod: "MANUAL_ROSTER"
    })));
  };
  // Save attendance (Offline-First via Dexie + Sync)
  const saveConfirmedAttendance = async () => {
    if (!user?.id || reviewItems.length === 0 || hasUnreviewedAttendance(reviewItems)) return;
    setIsSaving(true);
    setSaveSuccessMsg(null);
    const isDeviceOffline = !navigator.onLine;
    try {
      // 1. Save locally to IndexedDB first
      await offlineService.saveAttendanceSession({
        userId: user.id,
        sectionId: selectedSectionId,
        date: attendanceDate,
        timetableEntryId: selectedTimetableEntryId || undefined,
        records: reviewItems.map(r => ({
          studentId: r.studentId,
          studentName: r.studentName,
          rollNumber: r.rollNumber,
          status: r.status,
          verifiedByAi: r.verifiedByAi,
          aiConfidence: r.aiConfidence,
          verificationMethod: r.verificationMethod
        })),
        isOffline: isDeviceOffline
      });
      // 2. If online, trigger immediate sync to server
      if (!isDeviceOffline) {
        const syncResult = await syncNow();
        if (syncResult.success && syncResult.syncedBatches > 0) {
          setSaveSuccessMsg("Attendance confirmed and synced to central school database!");
        } else {
          setSaveSuccessMsg("Attendance confirmed and saved locally in IndexedDB! Server sync queued.");
        }
      } else {
        setSaveSuccessMsg("Attendance confirmed and stored offline in IndexedDB! Will automatically sync when internet reconnects.");
      }
      // Stop camera if still running
      stopCamera();
    } catch (err) {
      console.error("Error saving attendance:", err);
      alert("Failed to save attendance: " + err.message);
    } finally {
      setIsSaving(false);
    }
  };
  const currentClass = classes.find(c => c.id === selectedClassId);
  const currentPeriod = scheduledPeriods.find((period) => period.id === selectedTimetableEntryId) || null;
  const presentCount = reviewItems.filter(r => r.status === "PRESENT").length;
  const absentCount = reviewItems.filter(r => r.status === "ABSENT").length;
  const lateCount = reviewItems.filter(r => r.status === "LATE").length;
  const excusedCount = reviewItems.filter(r => r.status === "EXCUSED").length;
  const unreviewedCount = reviewItems.filter(r => !isAttendanceStatus(r.status)).length;
  return <AppShell><div className="space-y-6"><div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs space-y-4"><div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"><div><div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-emerald-50 text-emerald-700 text-xs font-bold mb-1 border border-emerald-200"><ShieldCheck className="w-3.5 h-3.5"></ShieldCheck><span>{"Attendance Verification Session"}</span></div><h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">{"Class Attendance Manager"}</h1></div><div className="inline-flex p-1 rounded-xl bg-slate-100 border border-slate-200 self-start sm:self-auto"><button onClick={() => setMode("AI")} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${mode === "AI" ? "bg-white text-emerald-800 shadow-xs" : "text-slate-600 hover:text-slate-900"}`}><Camera className="w-3.5 h-3.5 text-emerald-600"></Camera><span>{"AI Camera Mode"}</span></button><button onClick={() => {
              stopCamera();
              setMode("MANUAL");
            }} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${mode === "MANUAL" ? "bg-white text-emerald-800 shadow-xs" : "text-slate-600 hover:text-slate-900"}`}><ListFilter className="w-3.5 h-3.5 text-slate-600"></ListFilter><span>{"Manual Roster Mode"}</span></button></div></div>{isTeacher ? <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-100">
        <label className="form-field">Session date<input type="date" value={attendanceDate} onChange={(event) => setAttendanceDate(event.target.value)} /></label>
        <label className="form-field">Assigned period<select value={selectedTimetableEntryId} onChange={(event) => setSelectedTimetableEntryId(event.target.value)} disabled={isLoadingSchedule || scheduledPeriods.length === 0}>
          <option value="">{isLoadingSchedule ? "Loading your periods…" : "No period scheduled for this date"}</option>
          {scheduledPeriods.map((period) => <option key={period.id} value={period.id}>{period.startTime}–{period.endTime} · {period.subject} · {period.class.name} {period.section.name}</option>)}
        </select></label>
        <div className="timetable-period-summary sm:col-span-2" role="status">
          {isLoadingSchedule ? <span><RefreshCw size={15} className="animate-spin" aria-hidden="true" /> Loading your assigned periods…</span>
            : currentPeriod ? <span><BookOpen size={15} aria-hidden="true" /><strong>{currentPeriod.subject}</strong> · {currentPeriod.class.name}, Section {currentPeriod.section.name} · <Clock3 size={14} aria-hidden="true" /> {currentPeriod.startTime}–{currentPeriod.endTime}{currentPeriod.attendanceStatus && <> · <b>{currentPeriod.attendanceStatus === "MARKED" ? "Marked" : "Not marked"}</b></>}</span>
              : <span><CalendarDays size={15} aria-hidden="true" /> No class is assigned to your account for this date. Ask the principal to check the weekly timetable.</span>}
        </div>
        {scheduleError && <p className="muted-copy sm:col-span-2" role="status">{scheduleError}</p>}
      </div> : <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 pt-2 border-t border-slate-100">
        <label className="form-field">Class / standard<select value={selectedClassId} onChange={(event) => {
          const nextClass = classes.find((schoolClass) => schoolClass.id === event.target.value);
          setSelectedClassId(event.target.value);
          setSelectedSectionId(nextClass?.sections?.[0]?.id || "");
          setSelectedTimetableEntryId("");
        }}><option value="">Select class</option>{classes.map((schoolClass) => <option key={schoolClass.id} value={schoolClass.id}>{schoolClass.name}</option>)}</select></label>
        <label className="form-field">Section<select value={selectedSectionId} onChange={(event) => { setSelectedSectionId(event.target.value); setSelectedTimetableEntryId(""); }}><option value="">Select section</option>{currentClass?.sections.map((section) => <option key={section.id} value={section.id}>{section.name}</option>)}</select></label>
        <label className="form-field">Session date<input type="date" value={attendanceDate} onChange={(event) => setAttendanceDate(event.target.value)} /></label>
        <label className="form-field">Scheduled period (optional)<select value={selectedTimetableEntryId} onChange={(event) => {
          const period = scheduledPeriods.find((entry) => entry.id === event.target.value);
          setSelectedTimetableEntryId(event.target.value);
          if (period) { setSelectedClassId(period.classId); setSelectedSectionId(period.sectionId); }
        }}><option value="">Daily attendance (legacy)</option>{scheduledPeriods.map((period) => <option key={period.id} value={period.id}>{period.startTime}–{period.endTime} · {period.subject} · {period.class.name} {period.section.name}</option>)}</select></label>
        {isLoadingSchedule && <p className="muted-copy xl:col-span-4" role="status">Loading scheduled periods for this date…</p>}
        {scheduleError && <p className="muted-copy xl:col-span-4" role="status">{scheduleError}</p>}
      </div>}</div>{mode === "AI" && <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs space-y-4"><div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"><div><h2 className="text-base font-bold text-slate-900 flex items-center gap-2"><Camera className="w-5 h-5 text-emerald-600"></Camera><span>{"Classroom Photograph Capture"}</span></h2><p className="text-xs text-slate-500">{"Capture single or multiple classroom photos. The AI model detects all student faces and matches with authorized biometric vectors."}</p></div><div className="flex items-center gap-2"><span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${modelsReady ? "bg-emerald-50 text-emerald-800 border-emerald-200" : "bg-amber-50 text-amber-800 border-amber-200"}`}>{modelLoadingText}</span></div></div><div className="relative rounded-2xl bg-slate-900 overflow-hidden min-h-[280px] sm:min-h-[380px] flex items-center justify-center text-white border border-slate-800"><video ref={videoRef} playsInline={true} muted={true} className={`w-full max-h-[460px] object-cover ${isCameraActive ? "block" : "hidden"}`}></video>{!isCameraActive && <div className="text-center p-6 space-y-3"><div className="w-14 h-14 rounded-2xl bg-white/10 flex items-center justify-center mx-auto text-emerald-400"><Camera className="w-7 h-7"></Camera></div><div><p className="text-sm font-bold text-white">{"Camera is currently inactive"}</p><p className="text-xs text-slate-400 max-w-sm mt-0.5">{"Start live mobile/desktop camera to scan the classroom, or upload high-res classroom photos."}</p></div><div className="flex flex-wrap items-center justify-center gap-2 pt-2"><button onClick={startCamera} className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-2 transition-all cursor-pointer"><Camera className="w-4 h-4"></Camera><span>{"Start Classroom Camera"}</span></button><label className="px-4 py-2 rounded-xl bg-white/15 hover:bg-white/20 text-white font-semibold text-xs flex items-center gap-2 transition-all cursor-pointer border border-white/20"><Upload className="w-4 h-4"></Upload><span>{"Upload Classroom Photo"}</span><input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" /></label></div></div>}{isCameraActive && <div className="absolute bottom-4 left-0 right-0 flex items-center justify-center space-x-4"><button onClick={capturePhoto} disabled={isAnalyzing} className="w-16 h-16 rounded-full bg-white text-emerald-700 border-4 border-emerald-500 shadow-xl flex items-center justify-center hover:scale-105 active:scale-95 transition-all cursor-pointer disabled:opacity-50"><div className="w-8 h-8 rounded-full bg-emerald-600"></div></button><button onClick={stopCamera} className="px-3 py-1.5 rounded-xl bg-black/60 backdrop-blur-md text-white text-xs font-semibold hover:bg-black/80 transition-colors">{"Stop Camera"}</button></div>}{isAnalyzing && <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-xs flex flex-col items-center justify-center text-white z-20 space-y-2"><RefreshCw className="w-8 h-8 text-emerald-400 animate-spin"></RefreshCw><p className="text-sm font-bold">{"Scanning Classroom Faces..."}</p><p className="text-xs text-slate-300">{"Comparing 128-d biometric embeddings with class roster"}</p></div>}</div>{capturedImages.length > 0 && <div className="space-y-2 pt-2"><p className="text-xs font-bold text-slate-700">{"Captured Classroom Angles ("}{capturedImages.length}{"):"}</p><div className="flex gap-2 overflow-x-auto pb-2">{capturedImages.map((imgUrl, idx) => <div key={idx} className="relative w-24 h-16 rounded-xl overflow-hidden border-2 border-emerald-500 shrink-0 shadow-xs"><img src={imgUrl} alt={`Angle ${idx + 1}`} className="w-full h-full object-cover" /><span className="absolute bottom-1 right-1 bg-black/70 text-white text-[9px] font-bold px-1 rounded">{"#"}{idx + 1}</span></div>)}{isCameraActive && <button onClick={capturePhoto} className="w-24 h-16 rounded-xl border-2 border-dashed border-slate-300 hover:border-emerald-500 flex flex-col items-center justify-center text-slate-400 hover:text-emerald-600 text-xs font-semibold shrink-0"><Camera className="w-4 h-4"></Camera><span>{"+ Another"}</span></button>}</div></div>}{unrecognizedFaces.length > 0 && <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3"><AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5"></AlertTriangle><div className="space-y-1.5 flex-1"><p className="text-xs sm:text-sm font-bold text-amber-950">{unrecognizedFaces.length}{" Unrecognized Face(s) Detected in Classroom"}</p><p className="text-[11px] text-amber-800">{"These detected individuals did not match any authorized student in "}{currentClass?.name}{". They have been excluded from automatic marking."}</p><div className="flex gap-2 overflow-x-auto pt-1">{unrecognizedFaces.map((f, i) => <div key={i} className="w-12 h-12 rounded-lg overflow-hidden border border-amber-300 shrink-0"><img src={f.thumbnail} alt="Unrecognized face preview" className="w-full h-full object-cover" /></div>)}</div></div></div>}</div>}<div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs space-y-4"><div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"><div><div className="flex items-center gap-2"><h2 className="text-base sm:text-lg font-extrabold text-slate-900">{"Attendance Review Sheet"}</h2><span className="text-xs font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">{reviewItems.length}{" Students"}</span></div><p className="text-xs text-slate-500 mt-0.5">{"AI matches are suggestions. Choose a final status for each student before saving."}</p></div><div className="flex items-center gap-2 text-xs font-bold"><span className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200">{presentCount}{" Present"}</span><span className="px-2.5 py-1 rounded-lg bg-rose-50 text-rose-700 border border-rose-200">{absentCount}{" Absent"}</span>{unreviewedCount > 0 && <span className="px-2.5 py-1 rounded-lg bg-amber-50 text-amber-700 border border-amber-200">{unreviewedCount}{" To review"}</span>}{(lateCount > 0 || excusedCount > 0) && <span className="px-2.5 py-1 rounded-lg bg-amber-50 text-amber-700 border border-amber-200">{lateCount}{"L, "}{excusedCount}{"E"}</span>}</div></div><div className="flex flex-wrap items-center justify-between gap-2 p-2.5 bg-slate-50 rounded-2xl border border-slate-100 text-xs"><span className="font-semibold text-slate-600 pl-1">{"Roster Shortcuts:"}</span><div className="flex items-center gap-2"><button type="button" onClick={() => markAll("PRESENT")} className="min-h-11 px-2.5 py-1 rounded-lg bg-white hover:bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold transition-colors cursor-pointer">{"Mark All Present"}</button><button type="button" onClick={() => markAll("ABSENT")} className="min-h-11 px-2.5 py-1 rounded-lg bg-white hover:bg-rose-50 text-rose-700 border border-rose-200 font-bold transition-colors cursor-pointer">{"Mark All Absent"}</button></div></div>{isLoadingRoster ? <div className="py-12 text-center text-slate-400 text-xs"><RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-emerald-500"></RefreshCw>{"Loading student roster..."}</div> : <div className="divide-y divide-slate-100">{reviewItems.map(item => <div key={item.studentId} className="py-3 sm:py-3.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 hover:bg-slate-50/60 transition-colors rounded-xl px-2"><div className="flex items-center space-x-3">{item.faceThumbnail ? <div className="relative w-11 h-11 rounded-xl overflow-hidden border-2 border-emerald-500 shrink-0 shadow-2xs"><img src={item.faceThumbnail} alt={item.studentName} className="w-full h-full object-cover" /><span className="absolute bottom-0 right-0 bg-emerald-600 text-white p-0.5 rounded-tl"><Check className="w-2.5 h-2.5"></Check></span></div> : <div className="w-11 h-11 rounded-xl bg-slate-100 flex items-center justify-center font-bold text-slate-600 text-xs shrink-0 border border-slate-200">{item.rollNumber}</div>}<div><div className="flex items-center gap-2"><span className="font-bold text-sm text-slate-900">{item.studentName}</span><span className="text-xs text-slate-500 font-medium">{"Roll #"}{item.rollNumber}</span></div><div className="flex items-center gap-1.5 mt-0.5">{item.verifiedByAi && <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.2 rounded border ${item.matchFlag === "CONFIRMED" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : item.matchFlag === "UNCERTAIN" ? "bg-amber-50 text-amber-700 border-amber-200" : item.matchFlag === "DUPLICATE" ? "bg-purple-50 text-purple-700 border-purple-200" : "bg-slate-100 text-slate-600 border-slate-200"}`}><Sparkles className="w-2.5 h-2.5"></Sparkles>{item.matchFlag}{": "}{Math.round((item.aiConfidence || 0) * 100)}{"% match"}</span>}<span className="text-[10px] text-slate-700">{"Method: "}{item.verificationMethod.replace("_", " ")}</span></div></div></div><div className="flex items-center gap-1.5 self-end sm:self-auto"><button type="button" onClick={() => updateStudentStatus(item.studentId, "PRESENT")} aria-pressed={item.status === "PRESENT"} className={`min-h-11 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${item.status === "PRESENT" ? "bg-emerald-600 text-white shadow-xs" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>{"Present"}</button><button type="button" onClick={() => updateStudentStatus(item.studentId, "ABSENT")} aria-pressed={item.status === "ABSENT"} className={`min-h-11 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${item.status === "ABSENT" ? "bg-rose-600 text-white shadow-xs" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>{"Absent"}</button><button type="button" onClick={() => updateStudentStatus(item.studentId, "LATE")} aria-pressed={item.status === "LATE"} className={`min-h-11 px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${item.status === "LATE" ? "bg-amber-500 text-white shadow-xs" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>{"Late"}</button><button type="button" onClick={() => updateStudentStatus(item.studentId, "EXCUSED")} aria-pressed={item.status === "EXCUSED"} className={`min-h-11 px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${item.status === "EXCUSED" ? "bg-sky-600 text-white shadow-xs" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>{"Excused"}</button></div></div>)}</div>}{saveSuccessMsg && <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs sm:text-sm font-semibold flex items-center gap-2.5"><CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0"></CheckCircle2><span>{saveSuccessMsg}</span></div>}<div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"><div className="text-xs text-slate-500"><span className="font-bold text-slate-700">{"Audit Protocol:"}</span>{" Attendance records are digitally timestamped and signed with your teacher profile."}</div><button onClick={saveConfirmedAttendance} disabled={isSaving || isLoadingSchedule || isLoadingRoster || reviewItems.length === 0 || unreviewedCount > 0 || (isTeacher && !selectedTimetableEntryId)} className="px-6 py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-extrabold text-sm shadow-md shadow-emerald-600/30 flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"><Save className="w-4 h-4"></Save><span>{isSaving ? "Saving Records..." : "Confirm & Save Attendance"}</span></button></div></div></div></AppShell>;
}
