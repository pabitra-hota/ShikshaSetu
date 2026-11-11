import { BrowserRouter, Routes, Route } from "react-router-dom";
import AppProviders from "@/components/providers/AppProviders";
import ServiceWorkerRegister from "@/components/pwa/ServiceWorkerRegister";
import Landing from "@/pages/Landing";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import Attendance from "@/pages/Attendance";
import Classes from "@/pages/Classes";
import Students from "@/pages/Students";
import StudentDetail from "@/pages/StudentDetail";
import Teachers from "@/pages/Teachers";
import Timetable from "@/pages/Timetable";
import Reports from "@/pages/Reports";
import Settings from "@/pages/Settings";
import Sync from "@/pages/Sync";

export default function App() {
  return (
    <AppProviders initialTheme="dark">
      <BrowserRouter>
        <ServiceWorkerRegister />
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/attendance" element={<Attendance />} />
          <Route path="/classes" element={<Classes />} />
          <Route path="/students" element={<Students />} />
          <Route path="/students/:id" element={<StudentDetail />} />
          <Route path="/teachers" element={<Teachers />} />
          <Route path="/timetable" element={<Timetable />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/sync" element={<Sync />} />
          <Route path="*" element={<Landing />} />
        </Routes>
      </BrowserRouter>
    </AppProviders>
  );
}
