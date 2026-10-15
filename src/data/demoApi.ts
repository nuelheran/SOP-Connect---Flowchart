/**
 * Mode demo: dipakai otomatis bila VITE_SUPABASE_URL belum diisi.
 * Data hanya tersimpan di browser (localStorage) dan aturan akses ditiru di sisi klien.
 */
import { exampleContent, sanitizeSteps } from '../lib/steps';
import type {
  AccessRole, ActivityEntry, AppRole, AppSettings, FlowContent, Flowchart, Person, Profile, Step, Visibility, VersionEntry,
} from '../lib/types';
import { roleOf, canEditRole, canManageRole, displayName } from '../lib/format';
import { ApiError, ConflictError, type Api, type AuthEvent } from './api';

interface DemoDB {
  me: string | null;
  users: Profile[];
  flows: Omit<Flowchart, 'owner' | 'updater'>[];
  versions: (VersionEntry & { flowchart_id: string; created_by: string })[];
  activity: (ActivityEntry & { flowchart_id: string; actor_id: string | null })[];
  settings: AppSettings;
}

const KEY = 'flowcraft-demo-v1';
const now = () => new Date().toISOString();
const rid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

function seed(): DemoDB {
  const t = new Date(Date.now() - 86400000 * 2).toISOString();
  const users: Profile[] = [
    { id: 'u-demo', full_name: 'Pengguna Demo', email: 'demo@flowcraft.local', unit: 'IT Application Development', role: 'admin', created_at: t },
    { id: 'u-budi', full_name: 'Budi Santoso', email: 'budi@contoh.co.id', unit: 'Human Resources', role: 'user', created_at: t },
    { id: 'u-citra', full_name: 'Citra Lestari', email: 'citra@contoh.co.id', unit: 'IARM', role: 'user', created_at: t },
    { id: 'u-dewi', full_name: 'Dewi Anggraini', email: 'dewi@contoh.co.id', unit: 'IT', role: 'user', created_at: t },
  ];
  const ex = exampleContent();
  const id = 'demo-' + rid();
  return {
    me: null, users, settings: { allowed_email_domain: null },
    flows: [{ ...ex, id, visibility: 'org', version: 0, revision: 1, owner_id: 'u-budi', updated_by: 'u-budi', created_at: t, updated_at: t, access: [{ user_id: 'u-demo', role: 'editor' }] }],
    versions: [],
    activity: [{ id: rid(), flowchart_id: id, actor_id: 'u-budi', action: 'created', detail: 'Flowchart dibuat', created_at: t }],
  };
}

export class DemoApi implements Api {
  readonly mode = 'demo' as const;
  readonly aiEnabled = false;
  private db: DemoDB;
  private listeners = new Set<(e: AuthEvent) => void>();

  constructor() {
    let db: DemoDB | null = null;
    try { db = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { db = null; }
    this.db = db && Array.isArray(db.flows) ? db : seed();
    this.persist();
  }

  private persist() { try { localStorage.setItem(KEY, JSON.stringify(this.db)); } catch { /* penyimpanan penuh/diblokir */ } }
  private delay<T>(v: T): Promise<T> { return new Promise((r) => setTimeout(() => r(v), 60)); }
  private meProfile(): Profile {
    const me = this.db.users.find((u) => u.id === this.db.me);
    if (!me) throw new ApiError('Sesi berakhir. Silakan masuk kembali.', 'auth');
    return me;
  }
  private person(id?: string | null): Person | null {
    const u = this.db.users.find((x) => x.id === id);
    return u ? { id: u.id, full_name: u.full_name, email: u.email } : null;
  }
  private hydrate(f: DemoDB['flows'][number]): Flowchart {
    return JSON.parse(JSON.stringify({
      ...f, owner: this.person(f.owner_id), updater: this.person(f.updated_by),
      access: f.access.map((a) => ({ ...a, person: this.person(a.user_id) })),
    }));
  }
  private find(id: string) {
    const f = this.db.flows.find((x) => x.id === id);
    if (!f) throw new ApiError('Flowchart tidak ditemukan.', 'not_found');
    return f;
  }
  private log(fid: string, action: string, detail: string) {
    this.db.activity.push({ id: rid(), flowchart_id: fid, actor_id: this.db.me, action, detail, created_at: now() });
  }
  private role(f: DemoDB['flows'][number]) { return roleOf(f, this.meProfile()); }

  // ---------- autentikasi ----------
  async currentUser() { return this.delay(this.db.me ? this.meProfile() : null); }
  onAuthChange(cb: (e: AuthEvent) => void) { this.listeners.add(cb); return () => { this.listeners.delete(cb); }; }
  private emit(e: AuthEvent) { this.listeners.forEach((l) => l(e)); }
  async signIn(email: string) {
    const u = this.db.users.find((x) => x.email.toLowerCase() === email.trim().toLowerCase()) ?? this.db.users[0];
    this.db.me = u.id; this.persist(); this.emit('signed_in');
  }
  async signUp(email: string, _pw: string, fullName: string, unit: string) {
    let u = this.db.users.find((x) => x.email.toLowerCase() === email.trim().toLowerCase());
    if (!u) {
      u = { id: 'u-' + rid(), email: email.trim(), full_name: fullName.trim(), unit: unit.trim(), role: 'user', created_at: now() };
      this.db.users.push(u);
    }
    this.db.me = u.id; this.persist(); this.emit('signed_in');
    return { needsConfirmation: false };
  }
  async signOut() { this.db.me = null; this.persist(); this.emit('signed_out'); }
  async sendPasswordReset() { throw new ApiError('Reset kata sandi tidak tersedia di mode demo.'); }
  async updatePassword() { /* mode demo: tidak ada kata sandi */ }
  async updateMyProfile(fullName: string, unit: string) {
    const me = this.meProfile(); me.full_name = fullName.trim(); me.unit = unit.trim(); this.persist(); this.emit('updated');
  }

  // ---------- flowchart ----------
  async listFlowcharts() {
    return this.delay(this.db.flows.filter((f) => this.role(f) !== null).map((f) => this.hydrate(f))
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at)));
  }
  async getFlowchart(id: string) {
    const f = this.db.flows.find((x) => x.id === id);
    return this.delay(f && this.role(f) ? this.hydrate(f) : null);
  }
  async createFlowchart(c: FlowContent) {
    const me = this.meProfile(), t = now(), id = 'demo-' + rid();
    this.db.flows.push({ ...JSON.parse(JSON.stringify(c)), id, visibility: 'org', version: 0, revision: 1, owner_id: me.id, updated_by: me.id, created_at: t, updated_at: t, access: [] });
    this.log(id, 'created', 'Flowchart dibuat'); this.persist();
    return this.delay(id);
  }
  async updateFlowchart(id: string, c: Partial<FlowContent>, expectedRevision: number | null) {
    const f = this.find(id);
    if (!canEditRole(this.role(f))) throw new ApiError('Anda tidak memiliki izin mengubah flowchart ini.', '42501');
    if (expectedRevision != null && f.revision !== expectedRevision) throw new ConflictError();
    if (c.status && c.status !== f.status) this.log(id, 'status', 'Status diubah menjadi ' + c.status[0].toUpperCase() + c.status.slice(1));
    Object.assign(f, JSON.parse(JSON.stringify(c)), { revision: f.revision + 1, updated_at: now(), updated_by: this.db.me });
    this.persist();
    return this.delay({ revision: f.revision, updated_at: f.updated_at });
  }
  async setVisibility(id: string, visibility: Visibility) {
    const f = this.find(id);
    if (!canManageRole(this.role(f))) throw new ApiError('Hanya pemilik yang dapat mengubah visibilitas', '42501');
    f.visibility = visibility; f.revision++; f.updated_at = now();
    this.log(id, 'visibility', visibility === 'org' ? 'Visibilitas: semua pengguna' : 'Visibilitas: hanya yang diberi akses');
    this.persist();
    return { revision: f.revision };
  }
  async deleteFlowchart(id: string) {
    const f = this.find(id);
    if (!canManageRole(this.role(f))) throw new ApiError('Hanya pemilik atau admin yang dapat menghapus flowchart.', '42501');
    this.db.flows = this.db.flows.filter((x) => x.id !== id);
    this.db.versions = this.db.versions.filter((x) => x.flowchart_id !== id);
    this.db.activity = this.db.activity.filter((x) => x.flowchart_id !== id);
    this.persist();
  }

  // ---------- versi & riwayat ----------
  async saveVersion(id: string, note: string) {
    const f = this.find(id);
    if (!canEditRole(this.role(f))) throw new ApiError('Anda tidak dapat mengubah flowchart ini', '42501');
    f.version += 1;
    this.db.versions.push({ flowchart_id: id, version: f.version, title: f.title, steps: JSON.parse(JSON.stringify(f.steps)), note, created_at: now(), created_by: this.db.me! });
    this.log(id, 'version', `Versi ${f.version} disimpan${note ? ': ' + note : ''}`);
    this.persist();
    return f.version;
  }
  async listVersions(id: string) {
    return this.delay(this.db.versions.filter((v) => v.flowchart_id === id).sort((a, b) => b.version - a.version)
      .map((v) => ({ ...v, steps: sanitizeSteps(v.steps), author: this.person(v.created_by) })));
  }
  async restoreVersion(id: string, version: number) {
    const f = this.find(id);
    const v = this.db.versions.find((x) => x.flowchart_id === id && x.version === version);
    if (!v) throw new ApiError('Versi tidak ditemukan');
    f.steps = JSON.parse(JSON.stringify(v.steps)) as Step[]; f.title = v.title; f.revision++; f.updated_at = now(); f.updated_by = this.db.me;
    this.log(id, 'restore', 'Isi dikembalikan ke versi ' + version); this.persist();
  }
  async listActivity(id: string) {
    return this.delay(this.db.activity.filter((a) => a.flowchart_id === id).sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map((a) => ({ ...a, actor: this.person(a.actor_id) })));
  }
  async logActivity(id: string, action: string, detail: string) { this.log(id, action, detail); this.persist(); }

  // ---------- akses ----------
  async searchPeople(query: string) {
    const q = query.trim().toLowerCase();
    return this.delay(this.db.users.filter((u) => !q || u.full_name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q))
      .slice(0, 8).map((u) => ({ id: u.id, full_name: u.full_name, email: u.email, unit: u.unit })));
  }
  async grantAccess(id: string, userId: string, role: AccessRole) {
    const f = this.find(id);
    if (!canManageRole(this.role(f))) throw new ApiError('Hanya pemilik yang dapat mengatur akses', '42501');
    if (f.owner_id === userId) throw new ApiError('Pemilik sudah memiliki akses penuh');
    const nm = displayName(this.person(userId));
    const a = f.access.find((x) => x.user_id === userId);
    if (a) { if (a.role !== role) this.log(id, 'access', `Peran ${nm} diubah menjadi ${role === 'editor' ? 'Editor' : 'Pembaca'}`); a.role = role; }
    else { f.access.push({ user_id: userId, role }); this.log(id, 'access', `Akses ${role === 'editor' ? 'Editor' : 'Pembaca'} diberikan ke ${nm}`); }
    this.persist();
  }
  async revokeAccess(id: string, userId: string) {
    const f = this.find(id);
    if (!canManageRole(this.role(f))) throw new ApiError('Hanya pemilik yang dapat mengatur akses', '42501');
    f.access = f.access.filter((x) => x.user_id !== userId);
    this.log(id, 'access', 'Akses dicabut dari ' + displayName(this.person(userId))); this.persist();
  }
  async transferOwnership(id: string, userId: string) {
    const f = this.find(id);
    if (!canManageRole(this.role(f))) throw new ApiError('Hanya pemilik atau admin yang dapat mengalihkan kepemilikan', '42501');
    const prev = f.owner_id;
    f.access = f.access.filter((x) => x.user_id !== userId && x.user_id !== prev);
    f.access.push({ user_id: prev, role: 'editor' });
    f.owner_id = userId; f.revision++;
    this.log(id, 'owner', 'Kepemilikan dialihkan ke ' + displayName(this.person(userId))); this.persist();
  }

  async generateSteps(): Promise<{ title: string; steps: Step[] }> { throw new ApiError('Fitur AI tidak tersedia di mode demo.'); }

  // ---------- admin ----------
  async listUsers() { return this.delay([...this.db.users]); }
  async setUserRole(userId: string, role: AppRole) {
    if (this.meProfile().role !== 'admin') throw new ApiError('Hanya admin', '42501');
    if (role !== 'admin' && this.db.users.filter((u) => u.role === 'admin').length <= 1 && this.db.users.find((u) => u.id === userId)?.role === 'admin')
      throw new ApiError('Harus ada minimal satu admin');
    const u = this.db.users.find((x) => x.id === userId); if (u) u.role = role; this.persist();
  }
  async getSettings() { return { ...this.db.settings }; }
  async setAllowedDomain(domain: string) {
    this.db.settings.allowed_email_domain = domain.trim().replace(/^@/, '').toLowerCase() || null; this.persist();
  }
}
