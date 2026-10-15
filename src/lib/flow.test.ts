import { describe, expect, it } from 'vitest';
import { edgesOf, laneList, renderFlow, validate, wrap } from './flow';
import { exampleContent, fromNumbered, newStep, parseQuickList, sanitizeSteps } from './steps';

describe('edgesOf', () => {
  it('menghubungkan langkah berurutan dan cabang keputusan', () => {
    const ex = exampleContent().steps;
    const e = edgesOf(ex);
    // langkah 4 (keputusan): Ya → 5, Tidak → 9
    expect(e).toContainEqual({ from: 3, to: 4, kind: 'yes', label: 'Ya' });
    expect(e).toContainEqual({ from: 3, to: 8, kind: 'no', label: 'Tidak' });
    // langkah 6: Tidak kembali ke langkah 2
    expect(e).toContainEqual({ from: 5, to: 1, kind: 'no', label: 'Tidak' });
    // langkah 8 lompat ke Selesai
    expect(e).toContainEqual({ from: 7, to: 9, kind: 'main' });
    // Selesai tidak punya garis keluar
    expect(e.some((x) => x.from === 9)).toBe(false);
  });
});

describe('validate', () => {
  it('contoh lengkap tidak punya masalah', () => {
    expect(validate(exampleContent().steps)).toEqual([]);
  });
  it('mendeteksi keputusan tanpa cabang Tidak dan alur tanpa Selesai', () => {
    const s = [newStep('A', 'start', 'Mulai'), newStep('A', 'decision', 'Lengkap?')];
    const msgs = validate(s).map((i) => i.message);
    expect(msgs).toContain('Belum ada simbol Selesai');
    expect(msgs.some((m) => m.includes('cabang "Tidak"'))).toBe(true);
  });
  it('mendeteksi langkah yang tidak terhubung', () => {
    const s = [newStep('A', 'start', 'Mulai'), newStep('A', 'end', 'Selesai'), newStep('B', 'process', 'Yatim')];
    expect(validate(s).some((i) => i.message.includes('tidak terhubung'))).toBe(true);
  });
});

describe('wrap', () => {
  it('membatasi panjang baris dan jumlah baris', () => {
    const l = wrap('Memeriksa kesesuaian role dan segregation of duties secara menyeluruh sekali', 22, 3);
    expect(l.length).toBe(3);
    l.forEach((x) => expect(x.length).toBeLessThanOrEqual(22));
    expect(l[2].endsWith('…')).toBe(true);
  });
});

describe('renderFlow', () => {
  it('menghasilkan SVG dengan satu kolom per pelaksana dan teks ter-escape', () => {
    const c = exampleContent();
    c.steps[1].text = 'Isi <form> & kirim';
    const r = renderFlow(c, { table: true });
    expect(r.svg.startsWith('<svg')).toBe(true);
    expect(r.svg).toContain('&lt;form&gt; &amp; kirim');
    expect(r.svg).not.toContain('<form>');
    for (const lane of laneList(c.steps)) expect(r.svg).toContain(`>${lane}<`);
    expect(r.width).toBeGreaterThan(600);
    expect((r.svg.match(/class="fc-node"/g) || []).length).toBe(c.steps.length);
  });
  it('tetap aman untuk flowchart kosong', () => {
    expect(renderFlow({ title: '', steps: [] }).svg).toContain('</svg>');
  });
});

describe('parseQuickList', () => {
  it('membaca pelaksana, keputusan, dokumen, dan menambah Mulai/Selesai', () => {
    const s = parseQuickList('1. Karyawan: Mengisi formulir\nAtasan: Disetujui?\nHR: [D] Mengirim konfirmasi\nMencatat di sistem');
    expect(s.map((x) => x.type)).toEqual(['start', 'process', 'decision', 'document', 'process', 'end']);
    expect(s[1].lane).toBe('Karyawan');
    expect(s[3].text).toBe('Mengirim konfirmasi');
    expect(s[4].lane).toBe('HR'); // mewarisi pelaksana baris sebelumnya
  });
});

describe('fromNumbered', () => {
  it('mengubah nomor langkah menjadi id dan membuang next yang berlebihan', () => {
    const r = fromNumbered({ title: 'Cuti', steps: [
      { n: 1, text: 'Mulai', lane: 'Karyawan', type: 'start' },
      { n: 2, text: 'Disetujui?', lane: 'Atasan', type: 'decision', yes: 3, no: 4 },
      { n: 3, text: 'Mencatat cuti', lane: 'HR', type: 'process', next: 5 },
      { n: 4, text: 'Menerima penolakan', lane: 'Karyawan', type: 'document', next: 5 },
      { n: 5, text: 'Selesai', lane: 'Karyawan', type: 'end' },
    ] });
    expect(r.title).toBe('Cuti');
    expect(r.steps[1].yes).toBeNull(); // 3 = langkah berikutnya, jadi default
    expect(r.steps[1].no).toBe(r.steps[3].id);
    expect(r.steps[2].next).toBe(r.steps[4].id);
    expect(r.steps[3].next).toBeNull();
    expect(validate(r.steps)).toEqual([]);
  });
  it('menolak hasil kosong', () => {
    expect(() => fromNumbered({ steps: [] })).toThrow();
  });
});

describe('sanitizeSteps', () => {
  it('membuang tipe tidak dikenal dan id ganda', () => {
    const s = sanitizeSteps([{ id: 'x', type: 'hack', text: 1 }, { id: 'x', type: 'end' }]);
    expect(s[0].type).toBe('process');
    expect(s[0].text).toBe('');
    expect(new Set(s.map((x) => x.id)).size).toBe(2);
    expect(sanitizeSteps('bukan array')).toEqual([]);
  });
});
