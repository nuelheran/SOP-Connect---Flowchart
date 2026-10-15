import type {
  AccessRole, ActivityEntry, AppRole, AppSettings, FlowContent, Flowchart, Person, Profile, Step, Visibility, VersionEntry,
} from '../lib/types';

export class ApiError extends Error {
  constructor(message: string, public code?: string) { super(message); }
}
/** Flowchart sudah diubah orang lain sejak terakhir dimuat. */
export class ConflictError extends ApiError {
  constructor() { super('Flowchart ini sudah diubah oleh orang lain sejak Anda membukanya.', 'conflict'); }
}

export type SignUpResult = { needsConfirmation: boolean };
export type AuthEvent = 'signed_in' | 'signed_out' | 'password_recovery' | 'updated';

export interface Api {
  readonly mode: 'supabase' | 'demo';
  readonly aiEnabled: boolean;

  // --- autentikasi ---
  currentUser(): Promise<Profile | null>;
  onAuthChange(cb: (event: AuthEvent) => void): () => void;
  signIn(email: string, password: string): Promise<void>;
  signUp(email: string, password: string, fullName: string, unit: string): Promise<SignUpResult>;
  signOut(): Promise<void>;
  sendPasswordReset(email: string): Promise<void>;
  updatePassword(password: string): Promise<void>;
  updateMyProfile(fullName: string, unit: string): Promise<void>;

  // --- flowchart ---
  listFlowcharts(): Promise<Flowchart[]>;
  getFlowchart(id: string): Promise<Flowchart | null>;
  createFlowchart(content: FlowContent): Promise<string>;
  /** Simpan perubahan isi. `expectedRevision` null = timpa tanpa cek bentrok. */
  updateFlowchart(id: string, content: Partial<FlowContent>, expectedRevision: number | null): Promise<{ revision: number; updated_at: string }>;
  setVisibility(id: string, visibility: Visibility): Promise<{ revision: number }>;
  deleteFlowchart(id: string): Promise<void>;

  // --- versi & riwayat ---
  saveVersion(id: string, note: string): Promise<number>;
  listVersions(id: string): Promise<VersionEntry[]>;
  restoreVersion(id: string, version: number): Promise<void>;
  listActivity(id: string): Promise<ActivityEntry[]>;
  logActivity(id: string, action: string, detail: string): Promise<void>;

  // --- akses ---
  searchPeople(query: string): Promise<Person[]>;
  grantAccess(id: string, userId: string, role: AccessRole): Promise<void>;
  revokeAccess(id: string, userId: string): Promise<void>;
  transferOwnership(id: string, userId: string): Promise<void>;

  // --- AI (opsional) ---
  generateSteps(narrative: string): Promise<{ title: string; steps: Step[] }>;

  // --- admin ---
  listUsers(): Promise<Profile[]>;
  setUserRole(userId: string, role: AppRole): Promise<void>;
  getSettings(): Promise<AppSettings>;
  setAllowedDomain(domain: string): Promise<void>;
}
