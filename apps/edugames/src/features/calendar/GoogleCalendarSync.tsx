import React, { useCallback, useEffect, useState } from "react";
import { Cloud, RefreshCw } from "lucide-react";

interface GoogleStatus {
  configured: boolean;
  connected: boolean;
  status: string;
  needs_reconnect: boolean;
  last_synced_at: string | null;
  last_error: string;
  calendar_name: string | null;
}

const REASONS: Record<string, string> = {
  denied: "Google access was not allowed, so nothing was connected.",
  state: "That sign-in link expired. Try connecting again.",
  no_refresh_token: "Google did not give long-term access. Remove EduAI from your Google account's connected apps, then try again.",
  google: "Google could not finish connecting. Try again in a moment.",
  user: "Your account could not be found.",
};

const ago = (iso: string | null) => {
  if (!iso) return "not yet";
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} h ago`;
  return new Date(iso).toLocaleDateString();
};

/** Connects the user's Google Calendar: EduAI keeps a separate calendar in their Google account up to date. */
export const GoogleCalendarSync: React.FC<{ calendarBase: string }> = ({ calendarBase }) => {
  const [status, setStatus] = useState<GoogleStatus | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<"" | "connect" | "sync" | "disconnect">("");

  const headers = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("token")}` });

  const load = useCallback(async () => {
    try {
      const response = await fetch(`${calendarBase}/google-status`, { headers: headers() });
      if (response.ok) setStatus(await response.json());
    } catch {
      /* the page still works without the Google status */
    }
  }, [calendarBase]);

  useEffect(() => {
    void load();
    const params = new URLSearchParams(window.location.search);
    const outcome = params.get("google");
    if (outcome === "connected") setMessage("Google Calendar connected. Your events will appear in a calendar named after your university within a minute.");
    if (outcome === "error") setError(REASONS[params.get("reason") ?? ""] ?? "Google Calendar could not be connected.");
    if (outcome) {
      params.delete("google");
      params.delete("reason");
      const rest = params.toString();
      window.history.replaceState({}, document.title, window.location.pathname + (rest ? `?${rest}` : ""));
    }
  }, [load]);

  // Keep "last updated" fresh while the page is open.
  useEffect(() => {
    if (!status?.connected) return;
    const handle = window.setInterval(() => void load(), 60000);
    return () => window.clearInterval(handle);
  }, [status?.connected, load]);

  const connect = async () => {
    setBusy("connect");
    setError("");
    try {
      const back = encodeURIComponent(window.location.origin + window.location.pathname);
      const response = await fetch(`${calendarBase}/google/connect?return_to=${back}`, { headers: headers() });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || "Could not start the Google connection.");
      window.location.assign(data.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start the Google connection.");
      setBusy("");
    }
  };

  const syncNow = async () => {
    setBusy("sync");
    setError("");
    setMessage("");
    try {
      const response = await fetch(`${calendarBase}/google/sync-now`, { method: "POST", headers: headers() });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || "Could not sync right now.");
      setMessage(`Synced: ${data.inserted} added, ${data.patched} updated, ${data.deleted} removed.`);
      setStatus(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sync right now.");
      await load();
    } finally {
      setBusy("");
    }
  };

  const disconnect = async () => {
    if (!window.confirm("Disconnect Google Calendar? The EduAI calendar will be removed from your Google account. Your own Google events are not touched.")) return;
    setBusy("disconnect");
    setError("");
    setMessage("");
    try {
      const response = await fetch(`${calendarBase}/google`, { method: "DELETE", headers: headers() });
      if (!response.ok) throw new Error("Could not disconnect.");
      setStatus(await response.json());
      setMessage("Google Calendar disconnected.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not disconnect.");
    } finally {
      setBusy("");
    }
  };

  if (!status) return null;

  const warn = status.needs_reconnect || status.status === "error";
  return (
    <div className="space-y-2">
      <div className={`rounded-xl border px-4 py-3 text-sm flex flex-wrap items-center gap-3 ${status.needs_reconnect ? "border-amber-200 bg-amber-50 text-amber-900" : "border-blue-200 bg-blue-50 text-blue-800"}`}>
        <Cloud size={16} className="shrink-0" />
        <div className="min-w-0 flex-1">
          {status.needs_reconnect ? (
            <p>Google stopped accepting updates. Reconnect to keep your calendar in sync.</p>
          ) : status.connected ? (
            <p>
              Synced to Google{status.calendar_name ? ` as "${status.calendar_name}"` : ""} · last updated {ago(status.last_synced_at)}
              {warn && status.last_error ? <span className="block text-xs">Last problem: {status.last_error}. It will retry on its own.</span> : null}
            </p>
          ) : status.configured ? (
            <p>Show your EduAI events in your own Google Calendar. EduAI adds a separate calendar and never reads your personal events.</p>
          ) : (
            <p>Google Calendar sync is not set up on this server yet. Ask your administrator to enable it.</p>
          )}
        </div>
        <div className="flex gap-2">
          {status.connected && !status.needs_reconnect && (
            <>
              <button onClick={() => void syncNow()} disabled={busy !== ""} className="btn btn-outline flex items-center gap-1.5 text-xs disabled:opacity-50">
                <RefreshCw size={14} className={busy === "sync" ? "animate-spin" : ""} /> Sync now
              </button>
              <button onClick={() => void disconnect()} disabled={busy !== ""} className="btn btn-outline text-xs disabled:opacity-50">Disconnect</button>
            </>
          )}
          {(!status.connected || status.needs_reconnect) && (
            <button onClick={() => void connect()} disabled={busy !== "" || !status.configured} className="btn btn-primary text-xs disabled:opacity-50" title={status.configured ? "" : "Not set up on this server yet"}>
              {status.needs_reconnect ? "Reconnect Google Calendar" : "Connect Google Calendar"}
            </button>
          )}
        </div>
      </div>
      {message && <p role="status" className="rounded-xl border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-800">{message}</p>}
      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">{error}</p>}
    </div>
  );
};
