import type { Flowchart, FlowRole, Person, Profile } from './types';

export function displayName(p?: Person | null): string {
  if (!p) return 'Pengguna';
  return (p.full_name || '').trim() || p.email || 'Pengguna';
}

export function initials(name: string): string {
  const parts = name.replace(/\(.*?\)/g, '').trim().split(/\s+/);
  return (((parts[0] || '?')[0] || '?') + (parts[1] ? parts[1][0] : '')).toUpperCase();
}

export function hue(id: string): number {
  let h = 0;
  for (const c of id || 'x') h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}

export function relTime(iso?: string | null): string {
  if (!iso) return '';
  const d = (new Date(iso).getTime() - Date.now()) / 1000;
  const a = Math.abs(d);
  const rtf = new Intl.RelativeTimeFormat('id', { numeric: 'auto' });
  if (a < 60) return 'baru saja';
  if (a < 3600) return rtf.format(Math.round(d / 60), 'minute');
  if (a < 86400) return rtf.format(Math.round(d / 3600), 'hour');
  if (a < 86400 * 30) return rtf.format(Math.round(d / 86400), 'day');
  return new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function fmtDateTime(iso?: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/** Peran pengguna di UI. Server tetap menjadi penentu akhir lewat RLS. */
export function roleOf(f: Pick<Flowchart, 'owner_id' | 'visibility' | 'access'>, me: Profile | null): FlowRole | null {
  if (!me) return null;
  if (f.owner_id === me.id) return 'owner';
  if (me.role === 'admin') return 'admin';
  const a = (f.access || []).find((x) => x.user_id === me.id);
  if (a) return a.role;
  return f.visibility === 'org' ? 'viewer' : null;
}

export const ROLE_LABEL: Record<FlowRole, string> = {
  owner: 'Pemilik', admin: 'Admin', editor: 'Editor', reader: 'Pembaca', viewer: 'Pembaca',
};

export const canEditRole = (r: FlowRole | null) => r === 'owner' || r === 'admin' || r === 'editor';
export const canManageRole = (r: FlowRole | null) => r === 'owner' || r === 'admin';

export function safeFilename(s: string): string {
  return s.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 90) || 'flowchart';
}
