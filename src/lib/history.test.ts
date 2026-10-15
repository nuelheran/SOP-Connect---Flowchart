import { describe, expect, it } from 'vitest';
import { UndoHistory, mergeKey } from './history';
import { exampleContent } from './steps';

describe('UndoHistory', () => {
  it('undo dan redo bolak-balik', () => {
    const h = new UndoHistory<number>();
    h.record(1, '', 0); h.record(2, '', 1000);
    expect(h.undo(3)).toBe(2);
    expect(h.undo(2)).toBe(1);
    expect(h.undo(1)).toBeNull();
    expect(h.redo(1)).toBe(2);
    expect(h.redo(2)).toBe(3);
    expect(h.canRedo).toBe(false);
  });
  it('mengetik beruntun di kolom yang sama digabung menjadi satu langkah', () => {
    const h = new UndoHistory<string>(100, 800);
    h.record('', 'doc:title', 0); h.record('P', 'doc:title', 200); h.record('Pe', 'doc:title', 400);
    expect(h.size).toBe(1);
    h.record('Pen', 'doc:title', 2000); // jeda lama → langkah baru
    expect(h.size).toBe(2);
    h.record('Pena', 'doc:unit', 2100); // kolom lain → langkah baru
    expect(h.size).toBe(3);
  });
  it('perubahan baru menghapus redo', () => {
    const h = new UndoHistory<number>();
    h.record(1); h.undo(2);
    expect(h.canRedo).toBe(true);
    h.record(1, 'x');
    expect(h.canRedo).toBe(false);
  });
  it('dibatasi jumlahnya', () => {
    const h = new UndoHistory<number>(3);
    for (let i = 0; i < 10; i++) h.record(i, '', i * 1000);
    expect(h.size).toBe(3);
  });
});

describe('mergeKey', () => {
  const c = exampleContent();
  it('mengenali pengetikan teks satu langkah', () => {
    const steps = c.steps.map((s, i) => (i === 2 ? { ...s, text: s.text + 'x' } : s));
    expect(mergeKey(c, { steps })).toBe(`step:${c.steps[2].id}:text`);
  });
  it('perubahan struktural tidak digabung', () => {
    expect(mergeKey(c, { steps: c.steps.slice(1) })).toBe('');
    const typed = c.steps.map((s, i) => (i === 2 ? { ...s, type: 'decision' as const } : s));
    expect(mergeKey(c, { steps: typed })).toBe('');
    expect(mergeKey(c, { status: 'final' })).toBe('');
    expect(mergeKey(c, { title: 'x' })).toBe('doc:title');
  });
});
