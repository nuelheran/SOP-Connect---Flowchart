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
  chev: <path d="M4.5 6.5 8 10l3.5-3.5" />,
  undo: <path d="M5.5 4 2.5 7l3 3M2.5 7h7a4 4 0 0 1 0 8H8" />,
  redo: <path d="M10.5 4l3 3-3 3M13.5 7h-7a4 4 0 0 0 0 8H8" />,
  reset: <><path d="M2.5 8a5.5 5.5 0 1 0 1.6-3.9" /><path d="M2.5 2.5v3h3" /><path d="M6.5 6.5l3 3M9.5 6.5l-3 3" /></>,
  zin: <><circle cx="7" cy="7" r="4.2" /><path d="M10.2 10.2 13.5 13.5M5 7h4M7 5v4" /></>,
  zout: <><circle cx="7" cy="7" r="4.2" /><path d="M10.2 10.2 13.5 13.5M5 7h4" /></>,
  hand: <path d="M5.5 8V3.8a1 1 0 0 1 2 0V7.5M7.5 7V3a1 1 0 0 1 2 0v4.5M9.5 7.2V4a1 1 0 0 1 2 0v5.5c0 2.5-1.7 4.5-4.2 4.5-1.5 0-2.6-.7-3.4-1.9L2.3 9.6a1 1 0 0 1 1.6-1.2L5.5 10" />,
  image: <><rect x="2.5" y="3" width="11" height="10" rx="1.5" /><circle cx="6" cy="6.5" r="1.2" /><path d="m3 12 3.5-3.5 2.5 2.5 1.5-1.5L13 12" /></>,
  file: <><path d="M4 2.5h5l3 3v8H4z" /><path d="M9 2.5v3h3" /></>,
  code: <path d="M6 5 3 8l3 3M10 5l3 3-3 3" />,
  rows: <><rect x="2.5" y="3" width="11" height="10" rx="1.5" /><path d="M2.5 6.5h11M2.5 10h11M6 3v10" /></>,
  cols: <><rect x="2.5" y="3" width="11" height="10" rx="1.5" /><path d="M6 3v10M9.5 3v10M2.5 6h11" /></>,
  bulb: <><path d="M6 12.5h4M6.5 14h3M8 2a4 4 0 0 0-2.4 7.2c.5.4.9 1 .9 1.6V11h3v-.2c0-.6.4-1.2.9-1.6A4 4 0 0 0 8 2z" /></>,
  flow: <><rect x="2" y="2.5" width="5" height="3.5" rx="1" /><rect x="9" y="10" width="5" height="3.5" rx="1" /><path d="M4.5 6v5.5H9" /></>,
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
      <defs>
        <linearGradient id="fc-brand-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2F5BEA" /><stop offset="1" stopColor="#0EA5A4" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="28" height="28" rx="8" fill="url(#fc-brand-g)" />
      <rect x="6" y="6" width="9" height="6" rx="1.5" fill="#fff" />
      <polygon points="20,13 24.5,17 20,21 15.5,17" fill="#FCD34D" />
      <rect x="6" y="19" width="9" height="6" rx="3" fill="#fff" />
      <path d="M10.5 12v7M15 9h5v4" stroke="#fff" strokeWidth="1.4" fill="none" />
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

/** Tombol dengan menu tarik-turun (tutup saat klik di luar atau Escape). */
export function Dropdown({ label, children, align = 'right' }: { label: ReactNode; children: (close: () => void) => ReactNode; align?: 'left' | 'right' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown); document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);
  return (
    <div className="dropdown" ref={ref}>
      <button className="btn sm primary" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>{label}<Icon name="chev" /></button>
      {open && <div className="menu glass" role="menu" style={align === 'left' ? { left: 0, right: 'auto' } : undefined}>{children(() => setOpen(false))}</div>}
    </div>
  );
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
      <div className={'dialog glass' + (wide ? ' wide' : '')} role="dialog" aria-modal="true" aria-label={title} ref={ref}>
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
      {t && <div key={t.key} className={'toast glass' + (t.kind === 'err' ? ' err' : '')} role="status">{t.msg}</div>}
    </ToastCtx.Provider>
  );
}

export function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : 'Terjadi kesalahan';
}
