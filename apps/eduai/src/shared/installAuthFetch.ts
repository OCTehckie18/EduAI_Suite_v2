import { API_BASE_URL } from "./apiConfig";

const UNAUTHENTICATED_PATHS = ["/auth/google", "/auth/login", "/auth/refresh", "/institution/university"];
const SESSION_KEYS = ["token", "refresh_token", "user", "lastActivity", "edugames-auth-storage"];

export const tokenIsFresh = (token: string, skewMs = 15000): boolean => {
  try {
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return typeof payload.exp !== "number" || payload.exp * 1000 - skewMs > Date.now();
  } catch {
    return false;
  }
};

const readStorage = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

const endSession = (): void => {
  try {
    SESSION_KEYS.forEach((key) => localStorage.removeItem(key));
  } catch {
    /* storage unavailable */
  }
  if (window.location.pathname !== "/login") window.location.assign("/login");
};

/**
 * The backend requires a JWT on every endpoint except login. Attach the stored
 * access token to API requests, transparently renew it with the refresh token
 * when it has expired (or a request comes back 401), and send the user back to
 * the login screen when the session can no longer be renewed.
 */
export const installAuthFetch = (): void => {
  const nativeFetch = window.fetch.bind(window);
  let refreshInFlight: Promise<string | null> | null = null;

  const refreshAccessToken = (): Promise<string | null> => {
    if (refreshInFlight) return refreshInFlight;
    refreshInFlight = (async () => {
      const refresh = readStorage("refresh_token");
      if (!refresh) {
        endSession();
        return null;
      }
      try {
        const res = await nativeFetch(`${API_BASE_URL}/auth/refresh/`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refresh }),
        });
        if (res.status === 401) {
          endSession();
          return null;
        }
        if (!res.ok) return null;
        const data = await res.json();
        localStorage.setItem("token", data.access);
        if (data.refresh) localStorage.setItem("refresh_token", data.refresh);
        if (data.user) {
          const current = JSON.parse(readStorage("user") || "{}");
          localStorage.setItem("user", JSON.stringify({ ...current, ...data.user }));
        }
        return data.access as string;
      } catch {
        return null;
      } finally {
        refreshInFlight = null;
      }
    })();
    return refreshInFlight;
  };

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const isApiCall = url.startsWith(API_BASE_URL) || url.startsWith("/api");
    const isLoginCall = UNAUTHENTICATED_PATHS.some((path) => url.includes(path));
    if (!isApiCall || isLoginCall) return nativeFetch(input, init);

    let token = readStorage("token");
    if (!token) return nativeFetch(input, init);
    if (!tokenIsFresh(token)) {
      const renewed = await refreshAccessToken();
      if (!renewed) return nativeFetch(input, init);
      token = renewed;
    }

    const baseHeaders = init?.headers ?? (input instanceof Request ? input.headers : undefined);
    const send = (accessToken: string) => {
      const headers = new Headers(baseHeaders);
      const existing = headers.get("Authorization");
      // Replace a missing or stale header, but never a deliberately different one.
      if (!existing || existing === `Bearer ${readStorage("token")}` || existing.startsWith("Bearer ")) {
        headers.set("Authorization", `Bearer ${accessToken}`);
      }
      return nativeFetch(input, { ...init, headers });
    };

    const response = await send(token);
    if (response.status !== 401 || input instanceof Request) return response;
    const renewed = await refreshAccessToken();
    return renewed && renewed !== token ? send(renewed) : response;
  };
};
