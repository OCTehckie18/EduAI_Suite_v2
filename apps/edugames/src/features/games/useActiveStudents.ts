import { useState, useEffect } from "react";
import { gameAPI } from "../../shared/utils/gameAPI";
import type { Student } from "../../shared/utils/gameAPI";

export const useActiveStudents = (courseId: number | null) => {
  const [students, setStudents] = useState<Student[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!courseId) {
      setStudents([]);
      return;
    }

    const fetchStudents = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const data = await gameAPI.getActiveStudents(courseId);
        setStudents(data);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to load students",
        );
        setStudents([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchStudents();
  }, [courseId]);

  return { students, isLoading, error };
};
