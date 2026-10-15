import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import AccessPanel from '../components/AccessPanel';
import ComposeDialog from '../components/ComposeDialog';
import FlowPreview from '../components/FlowPreview';
import HistoryPanel from '../components/HistoryPanel';
import StepList from '../components/StepList';
import { Icon, Modal, errMsg, useToast } from '../components/ui';
import { api, ConflictError } from '../data';
import { ROLE_LABEL, canEditRole, canManageRole, displayName, roleOf } from '../lib/format';
import type { FlowContent, FlowStatus, Flowchart, Step } from '../lib/types';

type SaveState = 'saved' | 'dirty' | 'saving' | 'error' | 'conflict';
type Tab = 'steps' | 'info' | 'history';

const contentOf = (f: Flowchart): FlowContent => ({ title: f.title, code: f.code, unit: f.unit, description: f.description, status: f.status, steps: f.steps });

export default function EditorPage() {
  const { id = '' } = useParams();
  const { me } = useAuth();
  const nav = useNavigate();
  const toast = useToast();

  const [flow, setFlow] = useState<Flowchart | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading');
  const [loadErr, setLoadErr] = useState('');
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [tab, setTab] = useState<Tab>('steps');
  const [hl, setHl] = useState<string | null>(null);
  const [compose, setCompose] = useState(false);
  const [versionDlg, setVersionDlg] = useState(false);
  const [histKey, setHistKey] = useState(0);

  const flowRef = useRef<Flowchart | null>(null);
  const saveStateRef = useRef<SaveState>('saved');
  const setSS = useCallback((s: SaveState) => { saveStateRef.current = s; setSaveState(s); }, []);
  const dirty = useRef(false);
  const saving = useRef<Promise<void> | null>(null);
  const timer = useRef<number>();

  const role = flow ? roleOf(flow, me) : null;
  const editable = canEditRole(role);
  const manageable = canManageRole(role);

  const load = useCallback(async () => {
    try {
      const f = await api.getFlowchart(id);
      if (!f) { setState('missing'); return; }
      flowRef.current = f; setFlow(f); dirty.current = false; setSS('saved'); setState('ready');
    } catch (e) { setLoadErr(errMsg(e)); setState('error'); }
  }, [id, setSS]);

  useEffect(() => { setState('loading'); load(); }, [load]);

  /** Simpan perubahan yang tertunda. `force` = timpa meski ada perubahan dari orang lain. */
  const save = useCallback(async (force = false): Promise<void> => {
    window.clearTimeout(timer.current);
    if (saving.current) { await saving.current; if (!dirty.current) return; }
    if (!dirty.current || !flowRef.current) return;
    const f = flowRef.current;
    dirty.current = false;
    setSS('saving');
    const p = (async () => {
      try {
        const r = await api.updateFlowchart(f.id, contentOf(f), force ? null : f.revision);
        flowRef.current = { ...flowRef.current!, revision: r.revision, updated_at: r.updated_at, updated_by: me?.id ?? null, updater: me };
        setFlow(flowRef.current);
        setSS(dirty.current ? 'dirty' : 'saved');
      } catch (e) {
        dirty.current = true;
        if (e instanceof ConflictError) setSS('conflict');
        else { setSS('error'); toast(errMsg(e), 'err'); }
      }
    })();
    saving.current = p;
    await p;
    saving.current = null;
    if (dirty.current && flowRef.current && saveStateRef.current === 'dirty') timer.current = window.setTimeout(() => save(), 1000);
  }, [me, toast, setSS]);


  const patch = useCallback((p: Partial<FlowContent>) => {
    if (!flowRef.current) return;
    flowRef.current = { ...flowRef.current, ...p };
    setFlow(flowRef.current);
    dirty.current = true;
    if (saveStateRef.current === 'conflict') return; // tunggu keputusan pengguna
    setSS('dirty');
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => save(), 1000);
  }, [save, setSS]);

  // simpan saat meninggalkan halaman
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (dirty.current) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => { window.removeEventListener('beforeunload', warn); if (dirty.current && saveStateRef.current !== 'conflict') save(); };
  }, [save]);

  const reload = useCallback(async () => { await save(); await load(); setHistKey((k) => k + 1); }, [save, load]);

  const gotoStep = (stepId: string) => {
    setTab('steps'); setHl(stepId);
    requestAnimationFrame(() => document.querySelector(`.step[data-id="${CSS.escape(stepId)}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }));
  };

  const switchTab = (t: Tab) => { save(); setTab(t); };

  async function duplicate() {
    if (!flowRef.current) return;
    await save();
    try {
      const c = contentOf(flowRef.current);
      const nid = await api.createFlowchart({ ...c, title: (c.title || 'Flowchart') + ' (salinan)', status: 'draft' });
      await api.logActivity(nid, 'duplicate', `Diduplikat dari "${c.title || 'Flowchart tanpa judul'}"`).catch(() => {});
      toast('Salinan dibuat'); nav(`/f/${nid}`);
    } catch (e) { toast(errMsg(e), 'err'); }
  }

  function applyCompose(steps: Step[], title: string, source: 'list' | 'ai') {
    setCompose(false);
    patch({ steps, ...(flowRef.current?.title ? {} : { title }) });
    toast(`${steps.length} langkah disusun. Periksa dan koreksi bila perlu.`);
    api.logActivity(id, 'compose', source === 'ai' ? 'Langkah disusun dari narasi dengan AI' : 'Langkah disusun dari daftar cepat').catch(() => {});
  }

  if (state === 'loading') return <div className="center">Memuat flowchart…</div>;
  if (state === 'missing') return <div className="center"><div><h2>Flowchart tidak ditemukan</h2><p>Mungkin sudah dihapus, atau Anda belum diberi akses oleh pemiliknya.</p><Link className="btn" to="/">Kembali ke repositori</Link></div></div>;
  if (state === 'error' || !flow) return <div className="center"><div><h2>Gagal memuat</h2><p>{loadErr}</p><button className="btn" onClick={load}>Coba lagi</button></div></div>;

  const saveLabel: Record<SaveState, string> = { saved: 'Tersimpan', dirty: 'Belum tersimpan…', saving: 'Menyimpan…', error: 'Gagal menyimpan', conflict: 'Bentrok' };

  return (
    <div className="editor">
      <div className="ed-bar glass">
        <div className="ed-bar-in">
          <Link className="btn ghost" to="/" onClick={() => save()}><Icon name="back" />Repositori</Link>
          <input className="title-input" value={flow.title} readOnly={!editable} placeholder="Judul flowchart" aria-label="Judul flowchart"
            onChange={(e) => patch({ title: e.target.value })} autoFocus={editable && !flow.title} />
          <select className="input status-select" value={flow.status} disabled={!editable} aria-label="Status"
            onChange={(e) => patch({ status: e.target.value as FlowStatus })}>
            <option value="draft">Draft</option><option value="review">Review</option><option value="final">Final</option>
          </select>
          <span className="pill role">{role ? ROLE_LABEL[role] : 'Pembaca'}</span>
          <span className="mono muted" style={{ fontSize: 12 }}>{flow.version ? 'v' + flow.version : 'belum berversi'}</span>
          {editable && <span className={'save-pill ' + (saveState === 'error' || saveState === 'conflict' ? 'err' : saveState)} role="status"><i />{saveLabel[saveState]}</span>}
          {saveState === 'error' && <button className="btn sm" onClick={() => save()}>Coba simpan lagi</button>}
          {editable && <button className="btn" onClick={() => setVersionDlg(true)} title="Simpan salinan tetap, mis. saat diajukan untuk review"><Icon name="clock" />Simpan versi</button>}
        </div>
        {saveState === 'conflict' && (
          <div className="sub">
            <div className="banner err">
              <span style={{ flex: 1, minWidth: 220 }}>Flowchart ini baru saja diubah oleh orang lain. Pilih versi mana yang dipakai.</span>
              <button className="btn sm" onClick={() => { dirty.current = false; load(); }}>Muat versi terbaru (buang perubahan saya)</button>
              <button className="btn sm danger" onClick={() => { setSS('dirty'); dirty.current = true; save(true); }}>Timpa dengan perubahan saya</button>
            </div>
          </div>
        )}
        {!editable && (
          <div className="sub">
            <div className="banner">Anda membuka flowchart ini sebagai Pembaca. Hubungi pemiliknya ({displayName(flow.owner)}) untuk akses Editor.</div>
          </div>
        )}
      </div>
      <div className="ed-body">
        <section className="panel glass" aria-label="Isi flowchart">
          <div className="panel-tabs">
            <div className="seg" role="tablist">
              {([['steps', 'Langkah', 'list'], ['info', 'Info & Akses', 'user'], ['history', 'Versi & Riwayat', 'clock']] as [Tab, string, string][]).map(([k, l, ic]) => (
                <button key={k} role="tab" aria-selected={tab === k} onClick={() => switchTab(k)}><Icon name={ic} />{l}{k === 'steps' && <span className="mono muted" style={{ fontSize: 11 }}>{flow.steps.length}</span>}</button>
              ))}
            </div>
          </div>
          <div className="panel-scroll">
            {tab === 'steps' && <StepList steps={flow.steps} editable={editable} highlight={hl} onChange={(steps) => patch({ steps })} onCompose={() => setCompose(true)} />}
            {tab === 'info' && <AccessPanel flow={flow} editable={editable} manageable={manageable} onPatch={patch} onReload={reload} onDuplicate={duplicate} onDeleted={() => { dirty.current = false; nav('/'); }} />}
            {tab === 'history' && <HistoryPanel flow={flow} editable={editable} refreshKey={histKey} onRestored={async () => { dirty.current = false; await load(); setHistKey((k) => k + 1); }} />}
          </div>
        </section>
        <FlowPreview doc={flow} onNodeClick={gotoStep} />
      </div>

      {compose && <ComposeDialog hasSteps={flow.steps.some((s) => s.type !== 'start' && s.type !== 'end' && s.text.trim())} onApply={applyCompose} onClose={() => setCompose(false)} />}
      {versionDlg && <VersionDialog next={flow.version + 1} onClose={() => setVersionDlg(false)} onSave={async (note) => {
        await save();
        if (saveStateRef.current === 'conflict' || saveStateRef.current === 'error') throw new Error('Selesaikan masalah penyimpanan terlebih dahulu.');
        const v = await api.saveVersion(id, note);
        await load(); setHistKey((k) => k + 1);
        toast(`Versi ${v} tersimpan`);
      }} />}
    </div>
  );
}

function VersionDialog({ next, onSave, onClose }: { next: number; onSave: (note: string) => Promise<void>; onClose: () => void }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  return (
    <Modal title={`Simpan sebagai versi ${next}`} onClose={onClose} busy={busy}>
      <p className="note" style={{ margin: 0 }}>Versi adalah salinan tetap dari isi flowchart saat ini, misalnya saat diajukan untuk review atau disahkan. Versi lama tetap bisa dilihat dan dipulihkan.</p>
      <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Apa yang berubah? mis. Menambahkan verifikasi IT Security" maxLength={300} />
      {err && <div className="banner err">{err}</div>}
      <div className="row">
        <button className="btn" onClick={onClose} disabled={busy}>Batal</button>
        <button className="btn primary" disabled={busy} onClick={async () => {
          setBusy(true); setErr('');
          try { await onSave(note.trim()); onClose(); } catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
        }}>{busy ? 'Menyimpan…' : 'Simpan versi'}</button>
      </div>
    </Modal>
  );
}
