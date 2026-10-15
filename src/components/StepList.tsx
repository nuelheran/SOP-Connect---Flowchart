import { useState } from 'react';
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

const HINT_KEY = 'fc-hint-steps';
const SYMBOL_HELP: Record<StepType, string> = {
  start: 'Mulai — titik awal proses',
  process: 'Proses — aktivitas yang dikerjakan',
  decision: 'Keputusan — pertanyaan ya/tidak, alur bercabang',
  document: 'Dokumen — menghasilkan atau mengirim dokumen',
  end: 'Selesai — titik akhir proses',
};

export default function StepList({ steps, editable, highlight, onChange, onCompose }: Props) {
  const [hint, setHint] = useState(() => { try { return localStorage.getItem(HINT_KEY) !== '0'; } catch { return true; } });
  const lanes = laneList(steps).filter((l) => l !== UNASSIGNED_LANE);
  const labels = steps.map((s, i) => `${i + 1} · ${(s.text || STEP_TYPES[s.type] || '').slice(0, 34)}`);

  const update = (id: string, patch: Partial<Step>) => onChange(steps.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  const setType = (s: Step, type: StepType) => {
    if (s.type === type) return;
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
    const n = [...steps]; const s = newStep(steps[i]?.lane ?? ''); n.splice(i + 1, 0, s); onChange(n); focusStep(s.id);
  };
  const remove = (id: string) => onChange(steps.filter((s) => s.id !== id).map((s) => ({
    ...s, next: s.next === id ? null : s.next, yes: s.yes === id ? null : s.yes, no: s.no === id ? null : s.no,
  })));
  const add = () => {
    const endIdx = steps.length && steps[steps.length - 1].type === 'end' ? steps.length - 1 : steps.length;
    const n = [...steps]; const s = newStep(steps[endIdx - 1]?.lane ?? ''); n.splice(endIdx, 0, s); onChange(n); focusStep(s.id);
  };
  const closeHint = () => { setHint(false); try { localStorage.setItem(HINT_KEY, '0'); } catch { /* abaikan */ } };

  return (
    <>
      <datalist id="lane-options">{lanes.map((l) => <option key={l} value={l} />)}</datalist>
      {editable && hint && (
        <div className="hint" role="note">
          <span className="ic"><Icon name="bulb" /></span>
          <div>
            <b>Cara cepat menyusun flowchart</b>
            <ol>
              <li>Tulis aktivitas, diawali kata kerja (mis. "Memeriksa dokumen").</li>
              <li>Isi pelaksananya. Setiap pelaksana menjadi satu baris swimlane.</li>
              <li>Pilih simbol. Untuk Keputusan, tentukan ke mana alur jika Ya dan Tidak.</li>
            </ol>
            <div className="note" style={{ marginTop: 6 }}>Punya daftar aktivitas? Pakai <b>Susun otomatis</b> untuk menempelnya sekaligus.</div>
          </div>
          <button className="icon-btn" onClick={closeHint} aria-label="Tutup panduan"><Icon name="x" /></button>
        </div>
      )}
      {!steps.length && (
        <div className="empty glass" style={{ padding: '28px 16px' }}><h2 style={{ fontSize: 17 }}>Tulis aktivitas proses Anda</h2><p>Tambahkan langkah satu per satu, atau tempel daftar aktivitas sekaligus.</p></div>
      )}
      <div className="steps">
        {steps.map((s, i) => (
          <StepCard key={s.id} s={s} i={i} last={i === steps.length - 1} steps={steps} labels={labels} editable={editable}
            highlighted={highlight === s.id} update={update} setType={setType} move={move} insertAfter={insertAfter} remove={remove} />
        ))}
      </div>
      {editable && (
        <div className="add-row">
          <button className="btn primary" onClick={add}><Icon name="plus" />Tambah langkah</button>
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

interface CardProps {
  s: Step; i: number; last: boolean; steps: Step[]; labels: string[]; editable: boolean; highlighted: boolean;
  update: (id: string, p: Partial<Step>) => void; setType: (s: Step, t: StepType) => void;
  move: (i: number, d: number) => void; insertAfter: (i: number) => void; remove: (id: string) => void;
}

function StepCard({ s, i, last, steps, labels, editable, highlighted, update, setType, move, insertAfter, remove }: CardProps) {
  const ro = !editable;
  const options = steps.map((x, k) => (x.id === s.id ? null : <option key={x.id} value={x.id}>{labels[k]}</option>));
  const nextDefault = last ? '— (tidak ada)' : `Langkah berikutnya (${i + 2})`;
  const isTerminal = s.type === 'start' || s.type === 'end';
  const jumpLabel = s.next ? labels[steps.findIndex((x) => x.id === s.next)] : '';
  const summary = [s.output && 'Output: ' + s.output, s.time && s.time, jumpLabel && 'Lompat ke ' + jumpLabel].filter(Boolean).join(' · ');
  const showMore = !(s.type === 'end') && !(isTerminal && ro);

  return (
    <div className={'step' + (highlighted ? ' hl' : '')} data-id={s.id}>
      <div className="step-head">
        <span className="step-badge" aria-label={`Langkah ${i + 1}`}>{String(i + 1).padStart(2, '0')}</span>
        <div className="sympick" role="radiogroup" aria-label={`Simbol langkah ${i + 1}`}>
          {(Object.keys(STEP_TYPES) as StepType[]).map((t) => (
            <button key={t} type="button" role="radio" aria-checked={s.type === t} aria-label={STEP_TYPES[t]} title={SYMBOL_HELP[t]}
              disabled={ro && s.type !== t} onClick={() => !ro && setType(s, t)}>
              <SymbolIcon type={t} />
            </button>
          ))}
        </div>
        <span className="sym-label">{STEP_TYPES[s.type]}</span>
        {editable && (
          <div className="step-tools">
            <button className="icon-btn" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Naikkan langkah ${i + 1}`} title="Naikkan"><Icon name="up" /></button>
            <button className="icon-btn" onClick={() => move(i, 1)} disabled={last} aria-label={`Turunkan langkah ${i + 1}`} title="Turunkan"><Icon name="down" /></button>
            <button className="icon-btn" onClick={() => insertAfter(i)} aria-label={`Sisipkan langkah setelah ${i + 1}`} title="Sisipkan langkah di bawah"><Icon name="plus" /></button>
            <button className="icon-btn del" onClick={() => remove(s.id)} aria-label={`Hapus langkah ${i + 1}`} title="Hapus langkah"><Icon name="trash" /></button>
          </div>
        )}
      </div>

      <textarea rows={isTerminal ? 1 : 2} value={s.text} readOnly={ro} aria-label={`Aktivitas langkah ${i + 1}`}
        placeholder={s.type === 'decision' ? 'Tulis pertanyaannya, mis. Dokumen lengkap?' : 'Apa yang dikerjakan? Diawali kata kerja'}
        onChange={(e) => update(s.id, { text: e.target.value })} />

      <div className="step-grid">
        <label className="fld wide"><span>Pelaksana</span>
          <input list="lane-options" value={s.lane} readOnly={ro} placeholder="Jabatan atau unit, mis. Atasan Langsung" onChange={(e) => update(s.id, { lane: e.target.value })} /></label>
        {s.type === 'decision' && (
          <>
            <label className="fld yes"><span>Jika Ya, lanjut ke</span>
              <select value={s.yes ?? ''} disabled={ro} onChange={(e) => update(s.id, { yes: e.target.value || null })}>
                <option value="">{nextDefault}</option>{options}
              </select></label>
            <label className="fld no"><span>Jika Tidak, lanjut ke</span>
              <select value={s.no ?? ''} disabled={ro} onChange={(e) => update(s.id, { no: e.target.value || null })}>
                <option value="">— pilih langkah —</option>{options}
              </select></label>
          </>
        )}
      </div>

      {showMore && (
        <details className="more" open={!!(s.output || s.time || s.next) || undefined}>
          <summary>{isTerminal ? 'Alur' : 'Detail'} {summary ? <em>{summary}</em> : <em>{isTerminal ? 'lanjut ke langkah berikutnya' : 'output, waktu, lompat langkah'}</em>}</summary>
          <div className="step-grid">
            {!isTerminal && (
              <>
                <label className="fld"><span>Output / dokumen</span><input value={s.output} readOnly={ro} placeholder="mis. Formulir" onChange={(e) => update(s.id, { output: e.target.value })} /></label>
                <label className="fld"><span>Waktu</span><input value={s.time} readOnly={ro} placeholder="mis. 1 hari" onChange={(e) => update(s.id, { time: e.target.value })} /></label>
              </>
            )}
            {s.type !== 'decision' && (
              <label className="fld wide"><span>Lanjut ke</span>
                <select value={s.next ?? ''} disabled={ro} onChange={(e) => update(s.id, { next: e.target.value || null })}>
                  <option value="">{nextDefault}</option>{options}
                </select></label>
            )}
          </div>
        </details>
      )}
    </div>
  );
}
