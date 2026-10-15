import type { Api } from './api';
import { DemoApi } from './demoApi';
import { SupabaseApi } from './supabaseApi';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const ai = String(import.meta.env.VITE_ENABLE_AI ?? '').toLowerCase() === 'true';

/** Satu instance untuk seluruh aplikasi. Tanpa konfigurasi Supabase → mode demo. */
export const api: Api = url && key ? new SupabaseApi(url, key, ai) : new DemoApi();

export { ApiError, ConflictError } from './api';
