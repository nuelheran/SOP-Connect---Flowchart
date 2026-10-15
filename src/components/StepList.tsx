import { memo } from 'react';
import { STEP_TYPES, laneList, UNASSIGNED_LANE } from '../lib/flow';
import { newStep } from '../lib/steps';
import type { Step, StepType } from '../lib/types';
import { Icon, SymbolIcon } from './ui';

interface Props {
  steps: Step[];
  editable: boolean;
  highlight: string | null;
  onChange: (steps: Step[]) => void;
  onCompose: () => void;
}

export default function StepList({ steps, editable, highlight, onChange, onCompose }: Props) {
  const lanes = laneList(steps).filter((l) => l !== UNASSIGNED_LANE);
  const labels = steps.map((s, i) => `${i + 1} · ${(s.text || STEP_TYPES[s.type] || '').slice(0, 34)}`);

  const update = (id: string, patch: Partial<Step>) => onChange(steps.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  const setType = (s: Step, type: StepType) => {
    const p: Partial<Step> = { type };
    if (type === 'decision') { p.yes = s.next; p.next = null; }
    else if (s.type === 'decision') { p.next = s.yes; p.yes = null; p.no = null; }
    if ((type === 'start' || type === 'end') && !s.text.trim()) p.text = STEP_TYPES[type];
    update(s.id, p);
  };
  const move = (i: number, d: number) => {
    const j = i + d; if (j < 0 || j >= steps.length) return;
    const n = [...steps]; [n[i], n[j]] = [n[j], n[i]]; onChange(n);
  };
  const insertAfter = (i: number) => {
    const n = [...steps]; const s = newStep(steps[i]?.lane ?? ''); n.splice(i + 1, 0, s); onChange(n);
    focusStep(s.id);
  };
  const remove = (id: string) => onChange(steps.filter((s) => s.id !== id).map((s) => ({
    ...s, next: s.next === id ? null : s.next, yes: s.yes === id ? null : s.yes, no: s.no === id ? null : s.no,
  })));
  const add = () => {
    const endIdx = steps.length && steps[steps.length - 1].type === 'end' ? steps.length - 1 : steps.length;
    const n = [...steps]; const s = newStep(steps[endIdx - 1]?.lane ?? ''); n.splice(endIdx, 0, s); onChange(n);
    focusStep(s.id);
  };

  return (
    <>
      <datalist id="lane-options">{lanes.map((l) => <option key={l} value={l} />)}</datalist>
      {!steps.length && (
        <div className="empty" style={{ padding: '28px 16px' }}><h2 style={{ fontSize: 17 }}>Tulis aktivitas proses Anda</h2><p>Tambahkan langkah satu per satu, atau tempel daftar aktivitas sekaligus.</p></div>
      )}
      <div className="steps">
        {steps.map((s, i) => (
          <StepRow key={s.id} s={s} i={i} last={i === steps.length - 1} steps={steps} labels={labels} editable={editable}
            highlighted={highlight === s.id} update={update} setType={setType} move={move} insertAfter={insertAfter} remove={remove} />
        ))}
      </div>
      {editable && (
        <div className="add-row">
          <button className="btn" onClick={add}><Icon name="plus" />Tambah langkah</button>
          <button className="btn" onClick={onCompose}><Icon name="list" />Susun otomatis</button>
        </div>
      )}
    </>
  );
}

function focusStep(id: string) {
  requestAnimationFrame(() => {
    const el = document.querySelector<HTMLElement>(`.step[data-id="${CSS.escape(id)}"]`);
    el?.scrollIntoView({ block: 'nearest' });
    el?.querySelector('textarea')?.focus();
  });
}

interface RowProps {
  s: Step; i: number; last: boolean; steps: Step[]; labels: string[]; editable: boolean; highlighted: boolean;
  update: (id: string, p: Partial<Step>) => void; setType: (s: Step, t: StepType) => void;
  move: (i: number, d: number) => void; insertAfter: (i: number) => void; remove: (id: string) => void;
}

const StepRow = memo(function StepRow({ s, i, last, steps, labels, editable, highlighted, update, setType, move, insertAfter, remove }: RowProps) {
  const ro = !editable;
  const options = (selfId: string) => steps.map((x, k) => (x.id === selfId ? null : <option key={x.id} value={x.id}>{labels[k]}</option>));
  const nextDefault = last ? '— (tidak ada)' : `Langkah berikutnya (${i + 2})`;
  return (
    <div className={'step' + (highlighted ? ' hl' : '')} data-id={s.id}>
      <div className="step-no">{String(i + 1).padStart(2, '0')}<SymbolIcon type={s.type} /></div>
      <div className="step-main">
        <textarea rows={2} value={s.text} readOnly={ro} aria-label={`Aktivitas langkah ${i + 1}`}
          placeholder={s.type === 'decision' ? 'Pertanyaan keputusan, mis. Dokumen lengkap?' : 'Aktivitas, diawali kata kerja'}
          onChange={(e) => update(s.id, { text: e.target.value })} />
        <div className="step-meta">
          <label className="fld"><span>Pelaksana</span>
            <input list="lane-options" value={s.lane} readOnly={ro} placeholder="Jabatan / unit" onChange={(e) => update(s.id, { lane: e.target.value })} /></label>
          <label className="fld"><span>Simbol</span>
            <select value={s.type} disabled={ro} onChange={(e) => setType(s, e.target.value as StepType)}>
              {Object.entries(STEP_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select></label>
          {s.type === 'decision' ? (
            <>
              <label className="fld yes"><span>Jika Ya →</span>
                <select value={s.yes ?? ''} disabled={ro} onChange={(e) => update(s.id, { yes: e.target.value || null })}>
                  <option value="">{nextDefault}</option>{options(s.id)}
                </select></label>
              <label className="fld no"><span>Jika Tidak →</span>
                <select value={s.no ?? ''} disabled={ro} onChange={(e) => update(s.id, { no: e.target.value || null })}>
                  <option value="">— pilih langkah —</option>{options(s.id)}
                </select></label>
            </>
          ) : s.type !== 'end' ? (
            <label className="fld"><span>Lanjut ke</span>
              <select value={s.next ?? ''} disabled={ro} onChange={(e) => update(s.id, { next: e.target.value || null })}>
                <option value="">{nextDefault}</option>{options(s.id)}
              </select></label>
          ) : null}
          {s.type !== 'start' && s.type !== 'end' && (
            <>
              <label className="fld"><span>Output / dokumen</span><input value={s.output} readOnly={ro} placeholder="mis. Formulir" onChange={(e) => update(s.id, { output: e.target.value })} /></label>
              <label className="fld"><span>Waktu</span><input value={s.time} readOnly={ro} placeholder="mis. 1 hari" onChange={(e) => update(s.id, { time: e.target.value })} /></label>
            </>
          )}
        </div>
      </div>
      {editable ? (
        <div className="step-actions">
          <button className="icon-btn" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Naikkan langkah ${i + 1}`}><Icon name="up" /></button>
          <button className="icon-btn" onClick={() => move(i, 1)} disabled={last} aria-label={`Turunkan langkah ${i + 1}`}><Icon name="down" /></button>
          <button className="icon-btn" onClick={() => insertAfter(i)} aria-label={`Sisipkan langkah setelah ${i + 1}`}><Icon name="plus" /></button>
          <button className="icon-btn del" onClick={() => remove(s.id)} aria-label={`Hapus langkah ${i + 1}`}><Icon name="x" /></button>
        </div>
      ) : <span />}
    </div>
  );
});
