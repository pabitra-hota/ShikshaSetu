import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/components/providers/AppProviders";
import { Link } from "react-router-dom";
import AppShell from "@/components/layout/AppShell";
import { useSchoolDirectory } from "@/hooks/useSchoolDirectory";
import { Users, Search, Plus, Download, Upload, Eye, Edit2, Trash2, X, FileSpreadsheet, Sparkles, RefreshCw } from "lucide-react";
export default function StudentsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: directory, isPending: isLoading, isError, error } = useSchoolDirectory();
  const students = directory?.students ?? [];
  const classes = directory?.classes ?? [];
  const refreshDirectory = () => queryClient.invalidateQueries({ queryKey: ["school-directory"] });
  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedClassId, setSelectedClassId] = useState("");
  const [selectedSectionId, setSelectedSectionId] = useState("");
  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  // Selected Student for Edit / History
  const [activeStudent, setActiveStudent] = useState(null);
  const [studentHistory, setStudentHistory] = useState(null);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  // Form State
  const [formData, setFormData] = useState({
    name: "",
    rollNumber: "",
    classId: "",
    sectionId: "",
    gender: "Male",
    dob: "",
    guardianName: "",
    guardianPhone: "",
    address: ""
  });
  const [csvFile, setCsvFile] = useState(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importStatus, setImportStatus] = useState(null);
  // Filtered students
  const filteredStudents = students.filter(s => {
    const matchesSearch = searchQuery.trim() === "" || s.name.toLowerCase().includes(searchQuery.toLowerCase()) || s.rollNumber.includes(searchQuery) || s.studentId.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesClass = !selectedClassId || s.classId === selectedClassId;
    const matchesSection = !selectedSectionId || s.sectionId === selectedSectionId;
    return matchesSearch && matchesClass && matchesSection;
  });
  // Handle Add Student
  const handleAddStudent = async e => {
    e.preventDefault();
    try {
      const res = await fetch("/api/students", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(formData)
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to add student");
      }
      setIsAddModalOpen(false);
      resetForm();
      refreshDirectory();
    } catch (err) {
      alert(err.message);
    }
  };
  // Handle Edit Student
  const handleEditStudent = async e => {
    e.preventDefault();
    if (!activeStudent) return;
    try {
      const res = await fetch(`/api/students/${activeStudent.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(formData)
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to update student");
      }
      setIsEditModalOpen(false);
      setActiveStudent(null);
      resetForm();
      refreshDirectory();
    } catch (err) {
      alert(err.message);
    }
  };
  // Handle Delete Student
  const handleDeleteStudent = async (id, name) => {
    if (!confirm(`Are you sure you want to delete ${name}? This action cannot be undone.`)) {
      return;
    }
    try {
      const res = await fetch(`/api/students/${id}`, {
        method: "DELETE"
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to delete student");
      }
      refreshDirectory();
    } catch (err) {
      alert(err.message);
    }
  };
  // Open Edit Modal
  const openEditModal = stu => {
    setActiveStudent(stu);
    setFormData({
      name: stu.name,
      rollNumber: stu.rollNumber,
      classId: stu.classId,
      sectionId: stu.sectionId || "",
      gender: stu.gender || "Male",
      dob: stu.dob || "",
      guardianName: stu.guardianName || "",
      guardianPhone: stu.guardianPhone || "",
      address: stu.address || ""
    });
    setIsEditModalOpen(true);
  };
  // Open History Drawer
  const openHistoryModal = async stu => {
    setActiveStudent(stu);
    setIsHistoryModalOpen(true);
    setIsLoadingHistory(true);
    try {
      const res = await fetch(`/api/students/${stu.id}`);
      if (res.ok) {
        const data = await res.json();
        setStudentHistory(data.student);
      }
    } catch (err) {
      console.error("Error fetching student history:", err);
    } finally {
      setIsLoadingHistory(false);
    }
  };
  const resetForm = () => {
    setFormData({
      name: "",
      rollNumber: "",
      classId: classes[0]?.id || "",
      sectionId: classes[0]?.sections?.[0]?.id || "",
      gender: "Male",
      dob: "",
      guardianName: "",
      guardianPhone: "",
      address: ""
    });
  };
  // CSV Export
  const exportCsv = () => {
    if (students.length === 0) return;
    const headers = ["StudentID", "RollNumber", "Name", "Class", "Section", "Gender", "GuardianName", "GuardianPhone", "Address"];
    const rows = filteredStudents.map(s => [`"${s.studentId}"`, `"${s.rollNumber}"`, `"${s.name}"`, `"${s.className || ""}"`, `"${s.sectionName || ""}"`, `"${s.gender || ""}"`, `"${s.guardianName || ""}"`, `"${s.guardianPhone || ""}"`, `"${s.address || ""}"`]);
    const csvContent = [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    const blob = new Blob([csvContent], {
      type: "text/csv;charset=utf-8;"
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `Students_Roster_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };
  // CSV Import
  const handleCsvImport = async e => {
    e.preventDefault();
    if (!csvFile) return;
    setIsImporting(true);
    setImportStatus(null);
    const reader = new FileReader();
    reader.onload = async event => {
      try {
        const text = event.target?.result;
        const lines = text.split("\n").filter(l => l.trim().length > 0);
        if (lines.length < 2) throw new Error("CSV file must contain a header and at least one student row");
        const headers = lines[0].split(",").map(h => h.replace(/["\r]/g, "").trim());
        const rows = lines.slice(1).map(line => {
          const values = line.split(",").map(v => v.replace(/["\r]/g, "").trim());
          const obj = {};
          headers.forEach((h, idx) => {
            obj[h] = values[idx] || "";
          });
          return obj;
        });
        const res = await fetch("/api/students/import", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            rows
          })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Import failed");
        setImportStatus(`Successfully imported ${data.importedCount} student(s)!`);
        setCsvFile(null);
        refreshDirectory();
        setTimeout(() => {
          setIsImportModalOpen(false);
          setImportStatus(null);
        }, 1500);
      } catch (err) {
        setImportStatus("Error: " + err.message);
      } finally {
        setIsImporting(false);
      }
    };
    reader.readAsText(csvFile);
  };
  const selectedClassObj = classes.find(c => c.id === formData.classId);
  return <AppShell><div className="space-y-6"><div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs space-y-4"><div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"><div><div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-emerald-50 text-emerald-700 text-xs font-bold mb-1 border border-emerald-200"><Users className="w-3.5 h-3.5"></Users><span>{user?.role === "ADMIN" ? "Roster & Biometrics Directory" : "Your assigned class roster"}</span></div><h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">{user?.role === "ADMIN" ? "Student & Class Management" : "Student directory"}</h1></div>{user?.role === "ADMIN" ? <div className="flex items-center gap-2"><button onClick={() => {
              resetForm();
              setIsAddModalOpen(true);
            }} className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"><Plus className="w-4 h-4"></Plus><span>{"Add Student"}</span></button><button onClick={() => setIsImportModalOpen(true)} className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs flex items-center gap-1.5 transition-all cursor-pointer"><Upload className="w-4 h-4"></Upload><span>{"Import CSV"}</span></button><button onClick={exportCsv} disabled={students.length === 0} className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"><Download className="w-4 h-4"></Download><span>{"Export CSV"}</span></button></div> : <p className="muted-copy">Your assigned roster is view-only. Contact the principal to change student records.</p>}</div><div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-100"><div className="relative"><Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400"></Search><input type="text" placeholder="Search by name, roll, or ID..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-800 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-emerald-500" /></div><div><select value={selectedClassId} onChange={e => {
              setSelectedClassId(e.target.value);
              setSelectedSectionId("");
            }} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-800 font-semibold focus:outline-hidden focus:ring-2 focus:ring-emerald-500"><option value="">{"All Classes"}</option>{classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div><div><select value={selectedSectionId} disabled={!selectedClassId} onChange={e => setSelectedSectionId(e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-800 font-semibold focus:outline-hidden focus:ring-2 focus:ring-emerald-500 disabled:opacity-50"><option value="">{"All Sections"}</option>{classes.find(c => c.id === selectedClassId)?.sections?.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div></div></div><div className="directory-table bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">{directory?.source === "device" && <p className="data-source-note">Showing the roster saved on this device. Changes will sync when the connection returns.</p>}{isLoading ? <div className="py-16 text-center text-slate-400 text-xs"><RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-emerald-500"></RefreshCw>{"Loading student directory..."}</div> : isError ? <div className="py-16 text-center text-rose-700 text-xs" role="alert">{error?.message || "Could not load the student directory."}</div> : filteredStudents.length === 0 ? <div className="py-16 text-center text-slate-400 text-xs"><Users className="w-8 h-8 text-slate-300 mx-auto mb-2"></Users>{"No students found matching your filters."}</div> : <div className="overflow-x-auto"><table className="w-full text-left border-collapse text-xs sm:text-sm"><thead><tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase text-[11px] tracking-wider"><th className="py-3 px-4">{"Roll"}</th><th className="py-3 px-4">{"Student"}</th><th className="py-3 px-4">{"Class & Section"}</th><th className="py-3 px-4">{"Guardian Contact"}</th><th className="py-3 px-4">{"AI Biometrics"}</th><th className="py-3 px-4 text-right">{"Actions"}</th></tr></thead><tbody className="divide-y divide-slate-100">{filteredStudents.map(s => <tr key={s.id} className="hover:bg-slate-50/70 transition-colors"><td className="py-3 px-4 font-extrabold text-slate-900">{"#"}{s.rollNumber}</td><td className="py-3 px-4"><Link to={`/students/${s.id}`} className="student-name-link">{s.name}</Link><div className="text-[11px] text-slate-400">{s.studentId}{" \u2022 "}{s.gender}</div></td><td className="py-3 px-4"><span className="font-semibold text-slate-800">{s.className}{" - "}{s.sectionName}</span></td><td className="py-3 px-4 text-slate-600"><p className="font-medium">{s.guardianName || "—"}</p><p className="text-[11px] text-slate-400">{s.guardianPhone || "No Phone"}</p></td><td className="py-3 px-4">{s.descriptor ? <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200"><Sparkles className="w-3 h-3 text-emerald-600"></Sparkles>{"Registered"}</span> : <span className="text-[11px] text-slate-400">{"Pending photo"}</span>}</td><td className="py-3 px-4 text-right space-x-1"><button onClick={() => openHistoryModal(s)} title="View Attendance History" className="p-1.5 text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors cursor-pointer"><Eye className="w-4 h-4"></Eye></button>{user?.role === "ADMIN" && <><button onClick={() => openEditModal(s)} title="Edit Details" className="p-1.5 text-slate-500 hover:text-sky-700 hover:bg-sky-50 rounded-lg transition-colors cursor-pointer"><Edit2 className="w-4 h-4"></Edit2></button><button onClick={() => handleDeleteStudent(s.id, s.name)} title="Delete Student" className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"><Trash2 className="w-4 h-4"></Trash2></button></>}</td></tr>)}</tbody></table></div>}</div>{isAddModalOpen && <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4"><div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4"><div className="flex items-center justify-between pb-3 border-b border-slate-100"><h2 className="text-lg font-bold text-slate-900">{"Add New Student"}</h2><button onClick={() => setIsAddModalOpen(false)} className="p-1 text-slate-400 hover:text-slate-700 rounded-lg"><X className="w-5 h-5"></X></button></div><form onSubmit={handleAddStudent} className="space-y-3 text-xs"><div className="grid grid-cols-2 gap-3"><div><label className="block font-bold text-slate-700 mb-1">{"Full Name"}</label><input type="text" required={true} value={formData.name} onChange={e => setFormData({
                  ...formData,
                  name: e.target.value
                })} placeholder="e.g. Ramesh Ghosh" className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl" /></div><div><label className="block font-bold text-slate-700 mb-1">{"Roll Number"}</label><input type="text" required={true} value={formData.rollNumber} onChange={e => setFormData({
                  ...formData,
                  rollNumber: e.target.value
                })} placeholder="e.g. 15" className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl" /></div></div><div className="grid grid-cols-2 gap-3"><div><label className="block font-bold text-slate-700 mb-1">{"Class"}</label><select required={true} value={formData.classId} onChange={e => {
                  const cid = e.target.value;
                  const cls = classes.find(c => c.id === cid);
                  setFormData({
                    ...formData,
                    classId: cid,
                    sectionId: cls?.sections?.[0]?.id || ""
                  });
                }} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl"><option value="">{"Select Class"}</option>{classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div><div><label className="block font-bold text-slate-700 mb-1">{"Section"}</label><select required={true} value={formData.sectionId} onChange={e => setFormData({
                  ...formData,
                  sectionId: e.target.value
                })} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl"><option value="">{"Select Section"}</option>{selectedClassObj?.sections?.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div></div><div className="grid grid-cols-2 gap-3"><div><label className="block font-bold text-slate-700 mb-1">{"Gender"}</label><select value={formData.gender} onChange={e => setFormData({
                  ...formData,
                  gender: e.target.value
                })} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl"><option value="Male">{"Male"}</option><option value="Female">{"Female"}</option><option value="Other">{"Other"}</option></select></div><div><label className="block font-bold text-slate-700 mb-1">{"Date of Birth"}</label><input type="date" value={formData.dob} onChange={e => setFormData({
                  ...formData,
                  dob: e.target.value
                })} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl" /></div></div><div className="grid grid-cols-2 gap-3"><div><label className="block font-bold text-slate-700 mb-1">{"Guardian Name"}</label><input type="text" value={formData.guardianName} onChange={e => setFormData({
                  ...formData,
                  guardianName: e.target.value
                })} placeholder="e.g. Subir Ghosh" className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl" /></div><div><label className="block font-bold text-slate-700 mb-1">{"Guardian Phone"}</label><input type="tel" value={formData.guardianPhone} onChange={e => setFormData({
                  ...formData,
                  guardianPhone: e.target.value
                })} placeholder="+91 98000 00000" className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl" /></div></div><div><label className="block font-bold text-slate-700 mb-1">{"Address / Village"}</label><input type="text" value={formData.address} onChange={e => setFormData({
                ...formData,
                address: e.target.value
              })} placeholder="Sundarpur Village, Bolpur" className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl" /></div><div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2"><button type="button" onClick={() => setIsAddModalOpen(false)} className="px-4 py-2 rounded-xl bg-slate-100 text-slate-600 font-semibold">{"Cancel"}</button><button type="submit" className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold">{"Save Student"}</button></div></form></div></div>}{isEditModalOpen && activeStudent && <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4"><div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4"><div className="flex items-center justify-between pb-3 border-b border-slate-100"><h2 className="text-lg font-bold text-slate-900">{"Edit Student Record"}</h2><button onClick={() => setIsEditModalOpen(false)} className="p-1 text-slate-400 hover:text-slate-700 rounded-lg"><X className="w-5 h-5"></X></button></div><form onSubmit={handleEditStudent} className="space-y-3 text-xs"><div className="grid grid-cols-2 gap-3"><div><label className="block font-bold text-slate-700 mb-1">{"Full Name"}</label><input type="text" required={true} value={formData.name} onChange={e => setFormData({
                  ...formData,
                  name: e.target.value
                })} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl" /></div><div><label className="block font-bold text-slate-700 mb-1">{"Roll Number"}</label><input type="text" required={true} value={formData.rollNumber} onChange={e => setFormData({
                  ...formData,
                  rollNumber: e.target.value
                })} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl" /></div></div><div className="grid grid-cols-2 gap-3"><div><label className="block font-bold text-slate-700 mb-1">{"Class"}</label><select required={true} value={formData.classId} onChange={e => {
                  const cid = e.target.value;
                  const cls = classes.find(c => c.id === cid);
                  setFormData({
                    ...formData,
                    classId: cid,
                    sectionId: cls?.sections?.[0]?.id || ""
                  });
                }} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl">{classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div><div><label className="block font-bold text-slate-700 mb-1">{"Section"}</label><select required={true} value={formData.sectionId} onChange={e => setFormData({
                  ...formData,
                  sectionId: e.target.value
                })} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl">{selectedClassObj?.sections?.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div></div><div className="grid grid-cols-2 gap-3"><div><label className="block font-bold text-slate-700 mb-1">{"Guardian Name"}</label><input type="text" value={formData.guardianName} onChange={e => setFormData({
                  ...formData,
                  guardianName: e.target.value
                })} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl" /></div><div><label className="block font-bold text-slate-700 mb-1">{"Guardian Phone"}</label><input type="tel" value={formData.guardianPhone} onChange={e => setFormData({
                  ...formData,
                  guardianPhone: e.target.value
                })} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl" /></div></div><div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2"><button type="button" onClick={() => setIsEditModalOpen(false)} className="px-4 py-2 rounded-xl bg-slate-100 text-slate-600 font-semibold">{"Cancel"}</button><button type="submit" className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold">{"Update Record"}</button></div></form></div></div>}{isHistoryModalOpen && activeStudent && <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4"><div className="bg-white rounded-3xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 space-y-4 max-h-[90vh] overflow-y-auto"><div className="flex items-center justify-between pb-3 border-b border-slate-100"><div><h2 className="text-base sm:text-lg font-bold text-slate-900">{activeStudent.name}</h2><p className="text-xs text-slate-500">{"Roll #"}{activeStudent.rollNumber}{" \u2022 "}{activeStudent.className}{" - "}{activeStudent.sectionName}</p></div><button onClick={() => setIsHistoryModalOpen(false)} className="p-1 text-slate-400 hover:text-slate-700 rounded-lg"><X className="w-5 h-5"></X></button></div>{isLoadingHistory ? <div className="py-12 text-center text-xs text-slate-400"><RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-emerald-500"></RefreshCw>{"Loading attendance records..."}</div> : <div className="space-y-4"><div className="grid grid-cols-3 gap-3 bg-slate-50 p-3.5 rounded-2xl border border-slate-200 text-center text-xs"><div><p className="text-slate-400 font-bold uppercase text-[10px]">{"Total Days"}</p><p className="text-lg font-extrabold text-slate-900">{studentHistory?.attendanceStats?.total ?? 0}</p></div><div><p className="text-emerald-600 font-bold uppercase text-[10px]">{"Present"}</p><p className="text-lg font-extrabold text-emerald-700">{studentHistory?.attendanceStats?.present ?? 0}</p></div><div><p className="text-slate-400 font-bold uppercase text-[10px]">{"Attendance %"}</p><p className="text-lg font-extrabold text-emerald-800">{studentHistory?.attendanceStats?.rate ?? 0}{"%"}</p></div></div><div><h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">{"Recent Attendance Log"}</h3><div className="border border-slate-200 rounded-2xl overflow-hidden divide-y divide-slate-100 text-xs">{studentHistory?.attendances?.map(att => <div key={att.id} className="p-3 flex items-center justify-between hover:bg-slate-50"><div><p className="font-bold text-slate-800">{new Date(att.date).toLocaleDateString("en-IN", {
                        weekday: "short",
                        day: "numeric",
                        month: "short",
                        year: "numeric"
                      })}</p><p className="text-[11px] text-slate-400">{"Method: "}{att.verificationMethod.replace("_", " ")}{att.aiConfidence ? ` (${Math.round(att.aiConfidence * 100)}% confidence)` : ""}</p></div><span className={`px-2.5 py-1 rounded-lg text-xs font-bold ${att.status === "PRESENT" ? "bg-emerald-100 text-emerald-800" : att.status === "ABSENT" ? "bg-rose-100 text-rose-800" : att.status === "LATE" ? "bg-amber-100 text-amber-800" : "bg-sky-100 text-sky-800"}`}>{att.status}</span></div>)}</div></div></div>}</div></div>}{isImportModalOpen && <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4"><div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4"><div className="flex items-center justify-between pb-3 border-b border-slate-100"><h2 className="text-lg font-bold text-slate-900">{"Import Student Roster"}</h2><button onClick={() => setIsImportModalOpen(false)} className="p-1 text-slate-400 hover:text-slate-700 rounded-lg"><X className="w-5 h-5"></X></button></div><form onSubmit={handleCsvImport} className="space-y-4 text-xs"><div className="p-4 rounded-2xl border-2 border-dashed border-slate-300 text-center space-y-2"><FileSpreadsheet className="w-8 h-8 text-emerald-600 mx-auto"></FileSpreadsheet><p className="text-xs font-bold text-slate-800">{"Select CSV Roster File"}</p><p className="text-[11px] text-slate-400">{"Columns: Name, RollNumber, ClassName, SectionName, Gender, GuardianName, GuardianPhone, Address"}</p><input type="file" accept=".csv" required={true} onChange={e => setCsvFile(e.target.files?.[0] || null)} className="block w-full text-xs text-slate-500 file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100 cursor-pointer" /></div>{importStatus && <div className={`p-3 rounded-xl text-xs font-semibold ${importStatus.startsWith("Error") ? "bg-rose-50 text-rose-700 border border-rose-200" : "bg-emerald-50 text-emerald-700 border border-emerald-200"}`}>{importStatus}</div>}<div className="pt-2 flex items-center justify-end gap-2"><button type="button" onClick={() => setIsImportModalOpen(false)} className="px-4 py-2 rounded-xl bg-slate-100 text-slate-600 font-semibold">{"Cancel"}</button><button type="submit" disabled={isImporting || !csvFile} className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold disabled:opacity-50">{isImporting ? "Importing..." : "Upload & Import"}</button></div></form></div></div>}</div></AppShell>;
}
