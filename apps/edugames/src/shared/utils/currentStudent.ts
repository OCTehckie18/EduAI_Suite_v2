import { useAuthStore } from "../../store/useAuthStore";

/** Real account id of the signed-in student, or null when not signed in. */
export const getCurrentStudentId = (): number | null => {
  const id = useAuthStore.getState().user?.id;
  return typeof id === "number" && id > 0 ? id : null;
};

/**
 * Canonical identifier for game/quiz players: the student's register number,
 * falling back to the account id only if no register number is on file.
 */
export const getCurrentStudentKey = (): string | null => {
  const user = useAuthStore.getState().user;
  const registerNo = user?.register_no?.trim();
  if (registerNo) return registerNo;
  const id = getCurrentStudentId();
  return id === null ? null : String(id);
};

export const getCurrentStudentName = (): string =>
  useAuthStore.getState().user?.name ?? "";

export const getCurrentAccessToken = (): string | null =>
  useAuthStore.getState().token;
