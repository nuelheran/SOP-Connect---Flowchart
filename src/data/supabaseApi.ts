import { createClient, type PostgrestError, type SupabaseClient } from '@supabase/supabase-js';
import { fromNumbered, sanitizeSteps } from '../lib/steps';
import type {
  AccessRole, ActivityEntry, AppRole, AppSettings, FlowContent, Flowchart, Person, Profile, Visibility, VersionEntry,
} from '../lib/types';
import { ApiError, ConflictError, type Api, type AuthEvent } from './api';

const PERSON = 'id,full_name,email';
const LIST_COLS = `id,title,code,unit,description,status,visibility,steps,version,revision,owner_id,updated_by,created_at,updated_at,
  owner:profiles!flowcharts_owner_id_fkey(${PERSON}),
  access:flowchart_access(user_id,role)`;
const ONE_COLS = `id,title,code,unit,description,status,visibility,steps,version,revision,owner_id,updated_by,created_at,updated_at,
  owner:profiles!flowcharts_owner_id_fkey(${PERSON}),
  updater:profiles!flowcharts_updated_by_fkey(${PERSON}),
  access:flowchart_access(user_id,role,person:profiles!flowchart_access_user_id_fkey(${PERSON}))`;

/** Pesan galat yang dapat dibaca pengguna. Pesan dari trigger database sudah berbahasa Indonesia. */
function fail(e: PostgrestError | Error | { message: string; code?: string } | null): never {
  const err = e as { message?: string; code?: string };
  const msg = err?.message || 'Terjadi kesalahan';
  if (err?.code === '42501' && /row-level security/i.test(msg)) throw new ApiError('Anda tidak memiliki izin untuk tindakan ini.', '42501');
  if (/Failed to fetch|NetworkError/i.test(msg)) throw new ApiError('Tidak dapat terhubung ke server. Periksa koneksi internet.', 'network');
  throw new ApiError(msg, err?.code);
}

function authMessage(e: { message: string; status?: number }): string {
  const m = e.message || '';
  if (/Invalid login credentials/i.test(m)) return 'Email atau kata sandi salah.';
  if (/Email not confirmed/i.test(m)) return 'Email belum dikonfirmasi. Buka tautan konfirmasi di email Anda.';
  if (/User already registered/i.test(m)) return 'Email ini sudah terdaftar. Silakan masuk.';
  if (/Password should be at least/i.test(m)) return 'Kata sandi minimal 6 karakter.';
  if (/rate limit/i.test(m)) return 'Terlalu banyak permintaan email. Coba lagi sekitar satu jam lagi.';
  if (/Database error saving new user/i.test(m)) return 'Pendaftaran ditolak. Gunakan email kantor yang diizinkan admin.';
  return m || 'Terjadi kesalahan';
}

type Row = Record<string, unknown>;
function toFlow(r: Row): Flowchart {
  return {
    ...(r as unknown as Flowchart),
    steps: sanitizeSteps(r.steps),
    access: ((r.access as Row[]) || []).map((a) => ({ user_id: a.user_id as string, role: a.role as AccessRole, person: (a.person as Person) ?? null })),
  };
}

export class SupabaseApi implements Api {
  readonly mode = 'supabase' as const;
  readonly aiEnabled: boolean;
  private sb: SupabaseClient;

  constructor(url: string, anonKey: string, aiEnabled: boolean) {
    this.sb = createClient(url, anonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
    this.aiEnabled = aiEnabled;
  }

  private async uid(): Promise<string> {
    const { data } = await this.sb.auth.getSession();
    const id = data.session?.user.id;
    if (!id) throw new ApiError('Sesi berakhir. Silakan masuk kembali.', 'auth');
    return id;
  }

  // ---------- autentikasi ----------
  async currentUser(): Promise<Profile | null> {
    const { data } = await this.sb.auth.getSession();
    const user = data.session?.user;
    if (!user) return null;
    const { data: p, error } = await this.sb.from('profiles').select('id,full_name,email,unit,role,created_at').eq('id', user.id).maybeSingle();
    if (error) fail(error);
    return (p as Profile) ?? { id: user.id, email: user.email ?? '', full_name: '', unit: '', role: 'user' };
  }

  onAuthChange(cb: (event: AuthEvent) => void): () => void {
    const { data } = this.sb.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') cb('password_recovery');
      else if (event === 'SIGNED_IN') cb('signed_in');
      else if (event === 'SIGNED_OUT') cb('signed_out');
      else if (event === 'USER_UPDATED') cb('updated');
    });
    return () => data.subscription.unsubscribe();
  }

  async signIn(email: string, password: string) {
    const { error } = await this.sb.auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw new ApiError(authMessage(error), 'auth');
  }

  async signUp(email: string, password: string, fullName: string, unit: string) {
    const { data, error } = await this.sb.auth.signUp({
      email: email.trim(), password,
      options: { data: { full_name: fullName.trim(), unit: unit.trim() }, emailRedirectTo: window.location.origin },
    });
    if (error) throw new ApiError(authMessage(error), 'auth');
    return { needsConfirmation: !data.session };
  }

  async signOut() { await this.sb.auth.signOut(); }

  async sendPasswordReset(email: string) {
    const { error } = await this.sb.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin + '/' });
    if (error) throw new ApiError(authMessage(error), 'auth');
  }

  async updatePassword(password: string) {
    const { error } = await this.sb.auth.updateUser({ password });
    if (error) throw new ApiError(authMessage(error), 'auth');
  }

  async updateMyProfile(fullName: string, unit: string) {
    const id = await this.uid();
    const { error } = await this.sb.from('profiles').update({ full_name: fullName.trim(), unit: unit.trim() }).eq('id', id);
    if (error) fail(error);
  }

  // ---------- flowchart ----------
  async listFlowcharts() {
    const { data, error } = await this.sb.from('flowcharts').select(LIST_COLS).order('updated_at', { ascending: false }).limit(500);
    if (error) fail(error);
    return (data as Row[]).map(toFlow);
  }

  async getFlowchart(id: string) {
    const { data, error } = await this.sb.from('flowcharts').select(ONE_COLS).eq('id', id).maybeSingle();
    if (error) {
      if (error.code === '22P02') return null; // id bukan uuid
      fail(error);
    }
    return data ? toFlow(data as Row) : null;
  }

  async createFlowchart(c: FlowContent) {
    const owner_id = await this.uid();
    const { data, error } = await this.sb.from('flowcharts')
      .insert({ title: c.title, code: c.code, unit: c.unit, description: c.description, status: c.status, steps: c.steps, owner_id })
      .select('id').single();
    if (error) fail(error);
    return (data as { id: string }).id;
  }

  async updateFlowchart(id: string, c: Partial<FlowContent>, expectedRevision: number | null) {
    let q = this.sb.from('flowcharts').update(c).eq('id', id);
    if (expectedRevision != null) q = q.eq('revision', expectedRevision);
    const { data, error } = await q.select('revision,updated_at').maybeSingle();
    if (error) fail(error);
    if (!data) {
      const { data: exists } = await this.sb.from('flowcharts').select('id').eq('id', id).maybeSingle();
      if (!exists) throw new ApiError('Flowchart tidak ditemukan atau akses Anda telah dicabut.', 'not_found');
      if (expectedRevision != null) throw new ConflictError();
      throw new ApiError('Anda tidak memiliki izin mengubah flowchart ini.', '42501');
    }
    return data as { revision: number; updated_at: string };
  }

  async setVisibility(id: string, visibility: Visibility) {
    const { data, error } = await this.sb.from('flowcharts').update({ visibility }).eq('id', id).select('revision').maybeSingle();
    if (error) fail(error);
    if (!data) throw new ApiError('Anda tidak memiliki izin mengubah visibilitas.', '42501');
    return data as { revision: number };
  }

  async deleteFlowchart(id: string) {
    const { data, error } = await this.sb.from('flowcharts').delete().eq('id', id).select('id');
    if (error) fail(error);
    if (!data?.length) throw new ApiError('Hanya pemilik atau admin yang dapat menghapus flowchart.', '42501');
  }

  // ---------- versi & riwayat ----------
  async saveVersion(id: string, note: string) {
    const { data, error } = await this.sb.rpc('save_version', { fid: id, note });
    if (error) fail(error);
    return data as number;
  }

  async listVersions(id: string) {
    const { data, error } = await this.sb.from('flowchart_versions')
      .select(`version,title,note,steps,created_at,author:profiles!flowchart_versions_created_by_fkey(${PERSON})`)
      .eq('flowchart_id', id).order('version', { ascending: false });
    if (error) fail(error);
    return (data as Row[]).map((v) => ({ ...(v as unknown as VersionEntry), steps: sanitizeSteps(v.steps) }));
  }

  async restoreVersion(id: string, version: number) {
    const { error } = await this.sb.rpc('restore_version', { fid: id, ver: version });
    if (error) fail(error);
  }

  async listActivity(id: string) {
    const { data, error } = await this.sb.from('activity_log')
      .select(`id,action,detail,created_at,actor:profiles!activity_log_actor_id_fkey(${PERSON})`)
      .eq('flowchart_id', id).order('created_at', { ascending: false }).limit(100);
    if (error) fail(error);
    return data as unknown as ActivityEntry[];
  }

  async logActivity(id: string, action: string, detail: string) {
    const actor_id = await this.uid();
    const { error } = await this.sb.from('activity_log').insert({ flowchart_id: id, actor_id, action, detail: detail.slice(0, 500) });
    if (error) fail(error);
  }

  // ---------- akses ----------
  async searchPeople(query: string) {
    const q = query.replace(/[%,()*\\]/g, ' ').trim();
    let req = this.sb.from('profiles').select('id,full_name,email,unit').order('full_name').limit(8);
    if (q) req = req.or(`full_name.ilike.%${q}%,email.ilike.%${q}%`);
    const { data, error } = await req;
    if (error) fail(error);
    return data as Person[];
  }

  async grantAccess(id: string, userId: string, role: AccessRole) {
    const { error } = await this.sb.from('flowchart_access').upsert({ flowchart_id: id, user_id: userId, role }, { onConflict: 'flowchart_id,user_id' });
    if (error) fail(error);
  }

  async revokeAccess(id: string, userId: string) {
    const { error } = await this.sb.from('flowchart_access').delete().eq('flowchart_id', id).eq('user_id', userId);
    if (error) fail(error);
  }

  async transferOwnership(id: string, userId: string) {
    const { error } = await this.sb.rpc('transfer_ownership', { fid: id, new_owner: userId });
    if (error) fail(error);
  }

  // ---------- AI ----------
  async generateSteps(narrative: string) {
    const { data, error } = await this.sb.functions.invoke('generate-steps', { body: { narrative } });
    if (error) {
      let msg = 'Gagal menyusun langkah. Coba lagi.';
      try {
        const body = await (error as { context?: Response }).context?.json();
        if (body?.error) msg = body.error;
      } catch { /* abaikan */ }
      throw new ApiError(msg, 'ai');
    }
    return fromNumbered(data);
  }

  // ---------- admin ----------
  async listUsers() {
    const { data, error } = await this.sb.from('profiles').select('id,full_name,email,unit,role,created_at').order('created_at');
    if (error) fail(error);
    return data as Profile[];
  }

  async setUserRole(userId: string, role: AppRole) {
    const { error } = await this.sb.rpc('set_user_role', { target: userId, new_role: role });
    if (error) fail(error);
  }

  async getSettings(): Promise<AppSettings> {
    const { data, error } = await this.sb.from('app_settings').select('allowed_email_domain').maybeSingle();
    if (error) fail(error);
    return (data as AppSettings) ?? { allowed_email_domain: null };
  }

  async setAllowedDomain(domain: string) {
    const { error } = await this.sb.rpc('set_allowed_domain', { domain });
    if (error) fail(error);
  }
}
