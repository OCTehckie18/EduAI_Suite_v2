import { FormEvent, ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";

/* ---------- toasts ---------- */

type ToastKind = "success" | "error" | "info";
interface ToastItem { id: number; kind: ToastKind; message: string }
interface ToastApi { success: (message: string) => void; error: (message: string) => void; info: (message: string) => void }

const ToastContext = createContext<ToastApi | null>(null);
const TOAST_STYLES: Record<ToastKind, { icon: ReactNode; ring: string }> = {
  success: { icon: <CheckCircle2 className="h-5 w-5 text-emerald-600" />, ring: "border-emerald-200" },
  error: { icon: <XCircle className="h-5 w-5 text-rose-600" />, ring: "border-rose-200" },
  info: { icon: <Info className="h-5 w-5 text-sky-600" />, ring: "border-sky-200" },
};

/* ---------- confirmation dialogs ---------- */

export interface ConfirmOptions {
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  tone?: "danger" | "primary";
  /** Ask for a line of text (for example a rejection reason). The promise resolves to that text. */
  input?: { label: string; placeholder?: string; multiline?: boolean; required?: boolean };
}
type ConfirmResult = boolean | string;
type ConfirmFn = (options: ConfirmOptions) => Promise<ConfirmResult>;
const ConfirmContext = createContext<ConfirmFn | null>(null);

export function UIProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const push = useCallback((kind: ToastKind, message: string) => {
    const id = nextId.current++;
    setToasts((current) => [...current.slice(-3), { id, kind, message }]);
    window.setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), kind === "error" ? 7000 : 4000);
  }, []);
  const api = useMemo<ToastApi>(() => ({
    success: (message) => push("success", message),
    error: (message) => push("error", message),
    info: (message) => push("info", message),
  }), [push]);

  const [dialog, setDialog] = useState<{ options: ConfirmOptions; resolve: (value: ConfirmResult) => void } | null>(null);
  const confirm = useCallback<ConfirmFn>((options) => new Promise((resolve) => setDialog({ options, resolve })), []);
  const close = (value: ConfirmResult) => {
    dialog?.resolve(value);
    setDialog(null);
  };

  return (
    <ToastContext.Provider value={api}>
      <ConfirmContext.Provider value={confirm}>
        {children}
        <div className="pointer-events-none fixed bottom-4 right-4 z-[70] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2" aria-live="polite">
          {toasts.map((toast) => (
            <div key={toast.id} className={`pointer-events-auto flex items-start gap-3 rounded-xl border bg-white p-4 text-sm text-slate-900 shadow-2xl backdrop-blur ${TOAST_STYLES[toast.kind].ring}`}>
              {TOAST_STYLES[toast.kind].icon}
              <p className="flex-1 leading-snug">{toast.message}</p>
              <button onClick={() => setToasts((current) => current.filter((item) => item.id !== toast.id))} className="text-slate-500 hover:text-slate-900" aria-label="Dismiss"><X className="h-4 w-4" /></button>
            </div>
          ))}
        </div>
        {dialog && <ConfirmDialog options={dialog.options} onCancel={() => close(false)} onConfirm={close} />}
      </ConfirmContext.Provider>
    </ToastContext.Provider>
  );
}

export const useToast = (): ToastApi => {
  const value = useContext(ToastContext);
  if (!value) throw new Error("useToast must be used inside UIProvider");
  return value;
};

export const useConfirm = (): ConfirmFn => {
  const value = useContext(ConfirmContext);
  if (!value) throw new Error("useConfirm must be used inside UIProvider");
  return value;
};

function ConfirmDialog({ options, onCancel, onConfirm }: { options: ConfirmOptions; onCancel: () => void; onConfirm: (value: ConfirmResult) => void }) {
  const [text, setText] = useState("");
  const danger = options.tone === "danger";
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onCancel(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    onConfirm(options.input ? text.trim() : true);
  };
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}>
      <form onSubmit={submit} role="dialog" aria-modal="true" aria-label={options.title} className="w-full max-w-md rounded-2xl border border-slate-300 bg-slate-50 p-6 shadow-2xl">
        <div className="flex items-start gap-3">
          <div className={`mt-0.5 rounded-full p-2 ${danger ? "bg-rose-50 text-rose-700" : "bg-sky-50 text-sky-700"}`}><AlertTriangle className="h-5 w-5" /></div>
          <div className="flex-1">
            <h3 className="text-base font-semibold text-slate-900">{options.title}</h3>
            {options.message && <div className="mt-1 text-sm leading-relaxed text-slate-500">{options.message}</div>}
          </div>
        </div>
        {options.input && (
          <label className="mt-4 block text-sm text-slate-700">{options.input.label}
            {options.input.multiline
              ? <textarea autoFocus rows={3} required={options.input.required} value={text} onChange={(event) => setText(event.target.value)} placeholder={options.input.placeholder} className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-slate-900 outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/20" />
              : <input autoFocus required={options.input.required} value={text} onChange={(event) => setText(event.target.value)} placeholder={options.input.placeholder} className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-slate-900 outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/20" />}
          </label>
        )}
        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={onCancel} className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:text-slate-900">Cancel</button>
          <button type="submit" autoFocus={!options.input} className={`rounded-lg px-4 py-2 text-sm font-semibold text-white ${danger ? "bg-brand-blue hover:bg-brand-blue-dark" : "bg-sky-600 hover:bg-sky-500"}`}>{options.confirmLabel ?? "Confirm"}</button>
        </div>
      </form>
    </div>
  );
}

/* ---------- building blocks ---------- */

export function Modal({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label={title} className={`max-h-[calc(100dvh-2rem)] w-full overflow-y-auto rounded-2xl border border-slate-300 bg-white p-5 shadow-2xl sm:p-6 ${wide ? "max-w-3xl" : "max-w-lg"}`}>
        <div className="mb-5 flex items-center justify-between"><h3 className="text-lg font-semibold">{title}</h3><button onClick={onClose} className="rounded-lg p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900" aria-label="Close"><X className="h-5 w-5" /></button></div>
        {children}
      </div>
    </div>
  );
}

const BADGE_TONES: Record<string, string> = {
  green: "bg-emerald-50 text-emerald-700 border-emerald-200",
  amber: "bg-amber-50 text-brand-blue border-amber-200",
  red: "bg-rose-50 text-rose-700 border-rose-200",
  blue: "bg-sky-50 text-sky-700 border-sky-200",
  violet: "bg-violet-50 text-violet-700 border-violet-200",
  stone: "bg-slate-100 text-slate-700 border-slate-300",
};

export function Badge({ tone = "stone", children }: { tone?: keyof typeof BADGE_TONES; children: ReactNode }) {
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${BADGE_TONES[tone]}`}>{children}</span>;
}

export function PanelCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-2xl border border-slate-200 bg-white p-4 backdrop-blur sm:p-6 ${className}`}>{children}</section>;
}

export function PanelHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0"><h3 className="text-base font-semibold text-slate-900">{title}</h3>{subtitle && <p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-500">{subtitle}</p>}</div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function PrimaryButton({ children, onClick, disabled, type = "button", tone = "rose" }: { children: ReactNode; onClick?: () => void; disabled?: boolean; type?: "button" | "submit"; tone?: "rose" | "sky" | "emerald" | "violet" }) {
  const tones = { rose: "bg-brand-blue hover:bg-brand-blue-dark", sky: "bg-brand-blue hover:bg-brand-blue-dark", emerald: "bg-emerald-600 hover:bg-emerald-500", violet: "bg-brand-blue hover:bg-brand-blue-dark" };
  return <button type={type} onClick={onClick} disabled={disabled} className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white transition disabled:opacity-50 ${tones[tone]}`}>{children}</button>;
}

export function GhostButton({ children, onClick, disabled }: { children: ReactNode; onClick?: () => void; disabled?: boolean }) {
  return <button type="button" onClick={onClick} disabled={disabled} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2 text-sm text-slate-800 transition hover:border-slate-400 hover:text-slate-900 disabled:opacity-50">{children}</button>;
}

export function Chips<T extends string>({ value, options, onChange }: { value: T; options: readonly (readonly [T, string])[]; onChange: (value: T) => void }) {
  return (
    <div className="flex flex-wrap gap-2" role="tablist">
      {options.map(([key, label]) => (
        <button key={key} role="tab" aria-selected={value === key} onClick={() => onChange(key)} className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${value === key ? "bg-brand-blue text-white" : "border border-slate-300 text-slate-700 hover:border-slate-400 hover:text-slate-900"}`}>{label}</button>
      ))}
    </div>
  );
}

export function TableShell({ children }: { children: ReactNode }) {
  return <div className="overflow-x-auto rounded-xl border border-slate-200"><table className="w-full min-w-[640px] text-left text-sm">{children}</table></div>;
}

export const Th = ({ children, right = false }: { children?: ReactNode; right?: boolean }) => (
  <th className={`sticky top-0 bg-slate-50 p-3 text-xs font-semibold uppercase tracking-wide text-slate-500 sm:p-4 ${right ? "text-right" : ""}`}>{children}</th>
);

export function SkeletonRows({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-2 p-4" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, row) => (
        <div key={row} className="flex gap-4">
          {Array.from({ length: cols }).map((__, col) => <div key={col} className="h-5 flex-1 animate-pulse rounded bg-slate-100" style={{ opacity: 1 - row * 0.12 }} />)}
        </div>
      ))}
    </div>
  );
}

export function EmptyState({ icon, title, hint, action }: { icon?: ReactNode; title: string; hint?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
      {icon && <div className="rounded-full bg-slate-100 p-3 text-slate-500">{icon}</div>}
      <p className="font-semibold text-slate-800">{title}</p>
      {hint && <p className="max-w-md text-sm text-slate-500">{hint}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800" role="alert">
      <p>{message}</p>
      <button onClick={onRetry} className="mt-3 rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-semibold hover:bg-rose-100">Try again</button>
    </div>
  );
}

export function Avatar({ name }: { name: string }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "?";
  return <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-blue/15 to-brand-blue/25 text-xs font-bold text-slate-900">{initials}</div>;
}

export const inputClass = "mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-slate-900 outline-none focus:border-brand-accent focus:ring-2 focus:ring-brand-accent/25";

export function timeAgo(value: string | null | undefined): string {
  if (!value) return "—";
  const seconds = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return days < 30 ? `${days} d ago` : new Date(value).toLocaleDateString();
}
