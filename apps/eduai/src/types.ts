export interface AdminUser {
  id: number;
  email: string;
  name?: string;
  role: string;
  role_code?: string;
}

export interface RecentAction {
  id: number;
  action: string | null;
  actor: string;
  target: string | null;
  timestamp: string | null;
}

export interface Overview {
  institution: Record<string, number>;
  classrooms: number;
  users: Record<string, number>;
  roster: { total: number; signed_up: number };
  recent_actions: RecentAction[];
  teachers: { approved: number; pending: number; rejected: number; oldest_pending_at: string | null };
  roster_by_class: { class_name: string; program: string; total: number; signed_up: number }[];
  campus_stats: Record<string, { classrooms: number; teachers: number }>;
  warnings: { key: string; label: string; count: number; tab: TabKey }[];
  last_7_days: { students_joined: number; teachers_approved: number; classrooms_created: number };
}

export interface Campus {
  id: number;
  name: string;
  code: string;
  city: string;
  state?: string;
  address?: string;
  schools: number;
  departments: number;
  students: number;
  is_active: boolean;
}

export interface DirectoryUser {
  id: number;
  email: string;
  name: string;
  first_name?: string;
  last_name?: string;
  role: string;
  register_no?: string | null;
  emp_no?: string | null;
  is_active: boolean;
  campus?: { id: number; name: string } | null;
  department?: { id: number; name: string } | null;
  section?: { id: number; name: string } | null;
  teaching_programs?: number[];
}

export interface DeletedItem {
  id: number;
  content_type: string;
  label: string;
  deleted_at: string | null;
}

export interface TeacherApplication {
  id: number;
  name: string;
  email: string;
  emp_no: string | null;
  phone_number: string;
  profile_complete: boolean;
  status: "PENDING" | "APPROVED" | "REJECTED";
  rejection_reason: string;
  campus: string | null;
  school: string | null;
  department: string | null;
  applied_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
}

export type TabKey =
  | "overview" | "campuses" | "structure" | "university" | "look" | "modules" | "rules" | "notice" | "academic" | "documents" | "words"
  | "roster" | "users" | "approvals" | "recycle_bin";

export interface RestoreField { name: string; label: string; type: "text" | "email" | "textarea"; value: string; max_length?: number | null; required: boolean }
export interface RestoreRecord { content_type: string; id: number; label: string; is_active: boolean; fields: RestoreField[] }
export interface RestoreConflict { fields: string[]; record: RestoreRecord }
export interface RestoreDetail { content_type: string; id: number; label: string; fields: RestoreField[]; blockers: string[]; conflicts: RestoreConflict[] }
