/**
 * Riwayat Undo/Redo sederhana.
 * Perubahan beruntun dengan `key` yang sama dalam `mergeMs` (mis. mengetik di satu kolom)
 * digabung menjadi satu langkah undo, supaya Undo tidak menghapus huruf satu per satu.
 */
export class UndoHistory<T> {
  private past: T[] = [];
  private future: T[] = [];
  private lastKey = '';
  private lastAt = 0;

  constructor(private limit = 100, private mergeMs = 800) {}

  /** Catat keadaan SEBELUM perubahan. */
  record(prev: T, key = '', now = Date.now()) {
    const merge = key !== '' && key === this.lastKey && now - this.lastAt < this.mergeMs;
    if (!merge) {
      this.past.push(prev);
      if (this.past.length > this.limit) this.past.shift();
    }
    this.future = [];
    this.lastKey = key;
    this.lastAt = now;
  }

  undo(current: T): T | null {
    const prev = this.past.pop();
    if (prev === undefined) return null;
    this.future.push(current);
    this.lastKey = '';
    return prev;
  }

  redo(current: T): T | null {
    const next = this.future.pop();
    if (next === undefined) return null;
    this.past.push(current);
    this.lastKey = '';
    return next;
  }

  get canUndo() { return this.past.length > 0; }
  get canRedo() { return this.future.length > 0; }
  get size() { return this.past.length; }

  clear() { this.past = []; this.future = []; this.lastKey = ''; }
}

type Content = { title: string; code: string; unit: string; description: string; status: string; steps: { id: string }[] };

/**
 * Kunci penggabungan untuk satu perubahan: sama bila pengguna masih mengetik di kolom yang sama.
 * Perubahan struktural (tambah/hapus/pindah langkah, ganti simbol, status) mendapat kunci kosong.
 */
export function mergeKey(prev: Content, patch: Partial<Content>): string {
  const keys = Object.keys(patch) as (keyof Content)[];
  if (keys.length !== 1) return '';
  const k = keys[0];
  if (k === 'title' || k === 'code' || k === 'unit' || k === 'description') return 'doc:' + k;
  if (k !== 'steps' || !patch.steps) return '';
  const a = prev.steps, b = patch.steps;
  if (a.length !== b.length) return '';
  let key = '';
  for (let i = 0; i < a.length; i++) {
    if (a[i] === b[i]) continue;
    if (a[i].id !== b[i].id || key) return '';
    const ai = a[i] as unknown as Record<string, unknown>, bi = b[i] as unknown as Record<string, unknown>;
    const changed = Object.keys(bi).filter((f) => ai[f] !== bi[f]);
    if (changed.length !== 1 || !['text', 'lane', 'output', 'time'].includes(changed[0])) return '';
    key = `step:${a[i].id}:${changed[0]}`;
  }
  return key;
}
