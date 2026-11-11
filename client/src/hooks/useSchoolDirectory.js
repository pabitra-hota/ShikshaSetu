import { useQuery } from "@tanstack/react-query";
import { offlineService } from "@/lib/offline/service";
import { useAuth } from "@/components/providers/AppProviders";

async function fetchSchoolDirectory(userId) {
  await offlineService.ensureRosterOwner(userId);
  try {
    const [studentsResponse, classesResponse] = await Promise.all([
      fetch("/api/students"),
      fetch("/api/classes"),
    ]);
    if (!studentsResponse.ok || !classesResponse.ok) throw new Error("Could not load school records");

    const [studentsData, classesData] = await Promise.all([
      studentsResponse.json(),
      classesResponse.json(),
    ]);
    const students = studentsData.students ?? [];
    const classes = classesData.classes ?? [];
    const sections = classes.flatMap((schoolClass) => (schoolClass.sections ?? []).map((section) => ({
      id: section.id,
      name: section.name,
      classId: schoolClass.id,
      className: schoolClass.name,
    })));

    await offlineService.cacheRoster(
      students.map((student) => ({ ...student, updatedAt: new Date().toISOString() })),
      classes.map(({ id, name, gradeLevel }) => ({ id, name, gradeLevel })),
      sections,
      userId,
    );

    return { students, classes, source: "server" };
  } catch (error) {
    const cachedDirectory = await offlineService.getCachedRoster();
    if (cachedDirectory.students.length || cachedDirectory.classes.length) {
      return { ...cachedDirectory, source: "device" };
    }
    throw error;
  }
}

export function useSchoolDirectory() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["school-directory", user?.id],
    queryFn: () => fetchSchoolDirectory(user.id),
    enabled: Boolean(user?.id),
  });
}
