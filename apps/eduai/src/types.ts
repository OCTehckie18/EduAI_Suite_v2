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
  | "overview" | "campuses" | "structure" | "university"
  | "roster" | "users" | "approvals" | "recycle_bin";
