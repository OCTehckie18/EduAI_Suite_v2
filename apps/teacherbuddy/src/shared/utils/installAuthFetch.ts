import { API_BASE_URL } from "./apiConfig";

const UNAUTHENTICATED_PATHS = ["/auth/google", "/auth/login", "/auth/refresh"];

const tokenIsFresh = (token: string): boolean => {
  try {
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return typeof payload.exp !== "number" || payload.exp * 1000 > Date.now();
  } catch {
    return false;
  }
};

/**
 * The backend requires a JWT on every endpoint except login and audience joins.
 * Attach the stored access token to API requests that did not set their own
 * Authorization header, so individual call sites do not each have to.
 */
export const installAuthFetch = (): void => {
  const nativeFetch = window.fetch.bind(window);

  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const isApiCall = url.startsWith(API_BASE_URL) || url.startsWith("/api");
    const isLoginCall = UNAUTHENTICATED_PATHS.some((path) => url.includes(path));
    if (!isApiCall || isLoginCall) return nativeFetch(input, init);

    let token: string | null = null;
    try {
      token = localStorage.getItem("token");
    } catch {
      return nativeFetch(input, init);
    }
    if (!token || !tokenIsFresh(token)) return nativeFetch(input, init);

    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    if (!headers.has("Authorization")) headers.set("Authorization", `Bearer ${token}`);
    return nativeFetch(input, { ...init, headers });
  };
};
