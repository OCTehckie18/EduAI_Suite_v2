export const API_BASE_URL = (
  import.meta.env.VITE_API_URL || "/api/v1"
).replace(/\/$/, "");

export const API_ENDPOINTS = {
  AUTH: `${API_BASE_URL}/auth`,
  MASTER_ADMIN: `${API_BASE_URL}/master-admin`,
};

export const authHeaders = (): HeadersInit => {
  const token = localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
};
