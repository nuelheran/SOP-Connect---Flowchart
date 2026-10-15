export type StepType = 'start' | 'process' | 'decision' | 'document' | 'end';

export interface Step {
  id: string;
  text: string;
  lane: string;
  type: StepType;
  /** Tujuan setelah langkah ini; null = langkah berikutnya di daftar. */
  next: string | null;
  /** Khusus keputusan: tujuan bila "Ya" (null = langkah berikutnya). */
  yes: string | null;
  /** Khusus keputusan: tujuan bila "Tidak". */
  no: string | null;
  output: string;
  time: string;
}

export type FlowStatus = 'draft' | 'review' | 'final';
export type Visibility = 'org' | 'restricted';
export type AccessRole = 'editor' | 'reader';
export type AppRole = 'user' | 'admin';
/** Peran pengguna saat ini terhadap satu flowchart. */
export type FlowRole = 'owner' | 'admin' | 'editor' | 'reader' | 'viewer';

export interface Person {
  id: string;
  full_name: string;
  email: string;
  unit?: string;
}

export interface Profile extends Person {
  unit: string;
  role: AppRole;
  created_at?: string;
}

export interface AccessEntry {
  user_id: string;
  role: AccessRole;
  person?: Person | null;
}

export interface FlowContent {
  title: string;
  code: string;
  unit: string;
  description: string;
  status: FlowStatus;
  steps: Step[];
}

export interface Flowchart extends FlowContent {
  id: string;
  visibility: Visibility;
  version: number;
  revision: number;
  owner_id: string;
  owner?: Person | null;
  updated_by?: string | null;
  updater?: Person | null;
  created_at: string;
  updated_at: string;
  access: AccessEntry[];
}

export interface VersionEntry {
  version: number;
  title: string;
  note: string;
  steps: Step[];
  created_at: string;
  author?: Person | null;
}

export interface ActivityEntry {
  id: number | string;
  action: string;
  detail: string;
  created_at: string;
  actor?: Person | null;
}

export interface AppSettings {
  allowed_email_domain: string | null;
}
