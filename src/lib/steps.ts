import { STEP_TYPES } from './flow';
import type { Step, StepType } from './types';

export function uid(prefix = 's'): string {
  const rnd = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID().replace(/-/g, '').slice(0, 10)
    : Math.random().toString(36).slice(2, 12);
  return prefix + rnd;
}

export function newStep(lane = '', type: StepType = 'process', text = ''): Step {
  return { id: uid(), text, lane, type, next: null, yes: null, no: null, output: '', time: '' };
}

export function blankSteps(): Step[] {
  return [newStep('', 'start', 'Mulai'), newStep(''), newStep('', 'end', 'Selesai')];
}

/** Membersihkan data langkah dari sumber luar (impor JSON, hasil AI). */
export function sanitizeSteps(input: unknown): Step[] {
  if (!Array.isArray(input)) return [];
  const steps = input.slice(0, 200).map((raw): Step => {
    const s = (raw ?? {}) as Record<string, unknown>;
    const type = (typeof s.type === 'string' && s.type in STEP_TYPES ? s.type : 'process') as StepType;
    const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');
    return {
      id: typeof s.id === 'string' && s.id ? s.id.slice(0, 40) : uid(),
      text: str(s.text, 300), lane: str(s.lane, 80), type,
      next: typeof s.next === 'string' ? s.next : null,
      yes: typeof s.yes === 'string' ? s.yes : null,
      no: typeof s.no === 'string' ? s.no : null,
      output: str(s.output, 160), time: str(s.time, 40),
    };
  });
  const seen = new Set<string>();
  for (const s of steps) { if (seen.has(s.id)) s.id = uid(); seen.add(s.id); }
  return steps;
}

/**
 * "Daftar cepat": satu aktivitas per baris, format `Pelaksana: aktivitas`.
 * Baris diakhiri "?" = Keputusan, diawali "[D]" = Dokumen. Mulai & Selesai ditambahkan otomatis.
 */
export function parseQuickList(text: string): Step[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  let lane = '';
  const st: Step[] = [];
  for (let l of lines) {
    l = l.replace(/^\d+[.)]\s*/, '').replace(/^[-*•]\s*/, '');
    let t = l;
    const m = l.match(/^([^:|]{1,48})\s*[:|]\s*(.+)$/);
    if (m) { lane = m[1].trim(); t = m[2].trim(); }
    let type: StepType = 'process';
    if (/^(mulai|start)\.?$/i.test(t)) type = 'start';
    else if (/^(selesai|end|finish)\.?$/i.test(t)) type = 'end';
    else if (/\?\s*$/.test(t)) type = 'decision';
    else if (/^\[(d|dok|dokumen)\]\s*/i.test(t)) { type = 'document'; t = t.replace(/^\[(d|dok|dokumen)\]\s*/i, ''); }
    st.push(newStep(lane, type, t));
  }
  if (st.length && st[0].type !== 'start') st.unshift(newStep(st[0].lane, 'start', 'Mulai'));
  if (st.length && st[st.length - 1].type !== 'end') st.push(newStep(st[st.length - 1].lane, 'end', 'Selesai'));
  return st;
}

/** Hasil AI memakai nomor langkah (n); ubah menjadi id langkah. */
export function fromNumbered(raw: unknown): { title: string; steps: Step[] } {
  const obj = raw as { title?: unknown; steps?: unknown } | unknown[];
  const arr = Array.isArray(obj) ? obj : Array.isArray((obj as { steps?: unknown })?.steps) ? ((obj as { steps: unknown[] }).steps) : null;
  if (!arr || !arr.length) throw new Error('Hasil susunan kosong');
  const ids = arr.map(() => uid());
  const map = (n: unknown) => { const k = Number(n); return Number.isInteger(k) && k >= 1 && k <= arr.length ? ids[k - 1] : null; };
  const steps = arr.map((r, i): Step => {
    const s = (r ?? {}) as Record<string, unknown>;
    const type = (typeof s.type === 'string' && s.type in STEP_TYPES ? s.type : 'process') as StepType;
    return {
      id: ids[i], text: String(s.text ?? '').slice(0, 200), lane: String(s.lane ?? '').slice(0, 60), type,
      next: null, yes: null, no: null, output: String(s.output ?? '').slice(0, 120), time: String(s.time ?? '').slice(0, 40),
    };
  });
  arr.forEach((r, i) => {
    const s = (r ?? {}) as Record<string, unknown>;
    const st = steps[i];
    if (st.type === 'decision') {
      const y = map(s.yes);
      st.yes = y && y !== ids[i + 1] ? y : null;
      st.no = map(s.no);
    } else if (st.type !== 'end') {
      const n = map(s.next);
      st.next = n && n !== ids[i + 1] ? n : null;
    }
  });
  const title = !Array.isArray(obj) && typeof (obj as { title?: unknown })?.title === 'string' ? String((obj as { title: string }).title) : '';
  return { title, steps };
}

export function exampleContent() {
  const st = (id: string, lane: string, type: StepType, text: string, extra: Partial<Step> = {}): Step =>
    ({ id, lane, type, text, next: null, yes: null, no: null, output: '', time: '', ...extra });
  return {
    title: 'Permintaan Hak Akses Aplikasi',
    code: 'SOP-IT-001',
    unit: 'IT Application Development',
    description: 'Contoh flowchart untuk mencoba FLOWCRAFT. Silakan ubah, duplikat, atau hapus.',
    status: 'draft' as const,
    steps: [
      st('a1', 'Pemohon', 'start', 'Mulai'),
      st('a2', 'Pemohon', 'process', 'Mengisi formulir permintaan hak akses aplikasi', { output: 'Formulir permintaan akses', time: '10 menit' }),
      st('a3', 'Atasan Langsung', 'process', 'Meninjau kebutuhan akses sesuai tugas pemohon', { time: '1 hari' }),
      st('a4', 'Atasan Langsung', 'decision', 'Permintaan disetujui?', { no: 'a9' }),
      st('a5', 'IT Security', 'process', 'Memeriksa kesesuaian role dan segregation of duties', { output: 'Checklist SoD', time: '1 hari' }),
      st('a6', 'IT Security', 'decision', 'Sesuai kebijakan akses?', { no: 'a2' }),
      st('a7', 'IT Helpdesk', 'process', 'Membuat akun dan memberikan hak akses', { output: 'Akun aktif', time: '4 jam' }),
      st('a8', 'IT Helpdesk', 'document', 'Mengirim notifikasi dan panduan akses', { output: 'Email notifikasi akses', time: '15 menit', next: 'a10' }),
      st('a9', 'Pemohon', 'document', 'Menerima pemberitahuan penolakan', { output: 'Email penolakan' }),
      st('a10', 'Pemohon', 'end', 'Selesai'),
    ],
  };
}
