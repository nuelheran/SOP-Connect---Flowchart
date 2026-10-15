import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { FCP } from '../lib/flow';
import { displayName, hue, initials } from '../lib/format';
import type { Person, StepType } from '../lib/types';

const PATHS: Record<string, ReactNode> = {
  plus: <path d="M8 3v10M3 8h10" />,
  back: <path d="M10 3 5 8l5 5" />,
  up: <path d="M4 10l4-4 4 4" />,
  down: <path d="M4 6l4 4 4-4" />,
  x: <path d="M4 4l8 8M12 4l-8 8" />,
  dl: <path d="M8 2.5v8M4.5 7 8 10.5 11.5 7M3 13.5h10" />,
  upload: <path d="M8 13.5v-8M4.5 9 8 5.5 11.5 9M3 2.5h10" />,
  search: <><circle cx="7" cy="7" r="4.2" /><path d="M10.2 10.2 13.5 13.5" /></>,
  spark: <path d="M8 2v3M8 11v3M2 8h3M11 8h3M4 4l1.8 1.8M10.2 10.2 12 12M12 4l-1.8 1.8M5.8 10.2 4 12" />,
  list: <path d="M5.5 4h8M5.5 8h8M5.5 12h8M2.5 4h.01M2.5 8h.01M2.5 12h.01" />,
  trash: <path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5" />,
  copy: <><rect x="5.5" y="5.5" width="8" height="8" rx="1.5" /><path d="M10.5 5.5V3.5a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2" /></>,
  clock: <><circle cx="8" cy="8" r="5.5" /><path d="M8 5v3l2 1.5" /></>,
  print: <><path d="M4.5 6V2.5h7V6M4.5 11.5h-2v-5h11v5h-2" /><rect x="4.5" y="9.5" width="7" height="4" /></>,
  user: <><circle cx="8" cy="5.5" r="2.7" /><path d="M3 13.5c.8-2.4 2.7-3.5 5-3.5s4.2 1.1 5 3.5" /></>,
  out: <path d="M6.5 13.5h-3v-11h3M10 5l3 3-3 3M13 8H6" />,
  shield: <path d="M8 2 3 4v4c0 3 2.2 5 5 6 2.8-1 5-3 5-6V4z" />,
  restore: <path d="M3 8a5 5 0 1 0 1.5-3.5M3 2.5V5h2.5" />,
  eye: <><path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z" /><circle cx="8" cy="8" r="2" /></>,
};

export function Icon({ name }: { name: keyof typeof PATHS | string }) {
  return (
    <svg className="i" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {PATHS[name]}
    </svg>
  );
}

export function BrandMark() {
  return (
    <svg className="brand-mark" viewBox="0 0 30 30" aria-hidden="true">
      <rect x="1" y="1" width="28" height="28" rx="7" fill="var(--ink)" />
      <rect x="6" y="6" width="9" height="6" rx="1.5" fill="var(--bg)" />
      <polygon points="20,13 24.5,17 20,21 15.5,17" fill="#F2B65C" />
      <rect x="6" y="19" width="9" height="6" rx="3" fill="var(--bg)" />
      <path d="M10.5 12v7M15 9h5v4" stroke="var(--bg)" strokeWidth="1.4" fill="none" />
    </svg>
  );
}

export function SymbolIcon({ type }: { type: StepType }) {
  const [f, s] = FCP[type] ?? FCP.process;
  return (
    <svg className="sym" viewBox="0 0 22 16" aria-hidden="true">
      {type === 'decision' ? <polygon points="11,1 21,8 11,15 1,8" fill={f} stroke={s} strokeWidth="1.4" />
        : type === 'start' || type === 'end' ? <rect x="1" y="3" width="20" height="10" rx="5" fill={f} stroke={s} strokeWidth="1.4" />
        : type === 'document' ? <path d="M2 2h18v10c-5-3-8 3-18 0z" fill={f} stroke={s} strokeWidth="1.4" />
        : <rect x="1.5" y="2" width="19" height="12" rx="1.5" fill={f} stroke={s} strokeWidth="1.4" />}
    </svg>
  );
}

export function Avatar({ person, size = 26 }: { person?: Person | null; size?: number }) {
  const style = { width: size, height: size, fontSize: Math.round(size * 0.42) };
  if (!person) return <span className="avatar none" style={style}>–</span>;
  return (
    <span className="avatar" style={{ ...style, background: `hsl(${hue(person.id)} 45% 42%)` }} title={displayName(person)}>
      {initials(displayName(person))}
    </span>
  );
}

export function StatusPill({ status }: { status: string }) {
  const label = status === 'final' ? 'Final' : status === 'review' ? 'Review' : 'Draft';
  return <span className={`pill ${status}`}>{label}</span>;
}

/* ---------- dialog ---------- */
export function Modal({ title, onClose, children, wide, busy }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean; busy?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose(); };
    document.addEventListener('keydown', onKey);
    const first = ref.current?.querySelector<HTMLElement>('input, textarea, select, button.primary');
    first?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, busy]);
  return (
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className={'dialog' + (wide ? ' wide' : '')} role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}

export function ConfirmDialog({ title, body, confirmLabel, danger, onConfirm, onClose }: {
  title: string; body: ReactNode; confirmLabel: string; danger?: boolean; onConfirm: () => Promise<void> | void; onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Modal title={title} onClose={onClose} busy={busy}>
      <div>{body}</div>
      <div className="row">
        <button className="btn" onClick={onClose} disabled={busy}>Batal</button>
        <button className={'btn ' + (danger ? 'danger' : 'primary')} disabled={busy}
          onClick={async () => { setBusy(true); try { await onConfirm(); onClose(); } finally { setBusy(false); } }}>
          {busy ? 'Memproses…' : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

/* ---------- toast ---------- */
type ToastFn = (msg: string, kind?: 'ok' | 'err') => void;
const ToastCtx = createContext<ToastFn>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [t, setT] = useState<{ msg: string; kind: 'ok' | 'err'; key: number } | null>(null);
  const timer = useRef<number>();
  const show = useCallback<ToastFn>((msg, kind = 'ok') => {
    setT({ msg, kind, key: Date.now() });
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setT(null), kind === 'err' ? 5000 : 2800);
  }, []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {t && <div key={t.key} className={'toast' + (t.kind === 'err' ? ' err' : '')} role="status">{t.msg}</div>}
    </ToastCtx.Provider>
  );
}

export function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : 'Terjadi kesalahan';
}
