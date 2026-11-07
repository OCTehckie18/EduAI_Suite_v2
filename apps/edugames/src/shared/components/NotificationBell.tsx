import React, { useCallback, useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { apiCall } from "../utils/apiCall";

interface Item { id: number; title: string; body: string; link: string; created_at: string; read: boolean }

const ago = (iso: string) => {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours}h ago` : `${Math.floor(hours / 24)}d ago`;
};

/** The student's notifications: what their teachers and classes have done that concerns them. */
export const NotificationBell: React.FC = () => {
  const navigate = useNavigate();
  const [items, setItems] = useState<Item[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const r = await apiCall<{ unread: number; results: Item[] }>("GET", "/notifications");
    if (r.ok) { setItems(r.data.results); setUnread(r.data.unread); }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, 60000);
    return () => clearInterval(timer);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const toggle = () => {
    if (!open && unread > 0) {
      apiCall("POST", "/notifications/read", {});
      setUnread(0);
    }
    setOpen((o) => !o);
  };

  return (
    <div className="relative" ref={box}>
      <button onClick={toggle} aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"} aria-expanded={open} className="relative p-2 rounded-lg hover:bg-slate-100">
        <Bell size={20} />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] rounded-full bg-red-600 px-1 text-center text-[10px] font-bold text-white">{unread > 9 ? "9+" : unread}</span>
        )}
      </button>
      {open && (
        <div className="glass-card absolute right-0 top-12 w-80 max-w-[90vw] z-50 overflow-hidden animate-fade-in">
          <p className="px-4 py-3 text-sm font-bold border-b" style={{ borderColor: "var(--color-border)" }}>Notifications</p>
          {items.length === 0 ? (
            <p className="px-4 py-6 text-sm text-center" style={{ color: "var(--color-text-secondary)" }}>Nothing new.</p>
          ) : (
            <ul className="max-h-96 overflow-y-auto divide-y" style={{ borderColor: "var(--color-border)" }}>
              {items.map((n) => (
                <li key={n.id}>
                  <button className={`w-full text-left px-4 py-3 hover:bg-slate-50 ${n.read ? "" : "bg-blue-50"}`} onClick={() => { setOpen(false); if (n.link) navigate(n.link); }}>
                    <p className="text-sm font-semibold">{n.title}</p>
                    {n.body && <p className="text-xs" style={{ color: "var(--color-text-secondary)" }}>{n.body}</p>}
                    <p className="mt-0.5 text-[11px]" style={{ color: "var(--color-text-muted)" }}>{ago(n.created_at)}</p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};
