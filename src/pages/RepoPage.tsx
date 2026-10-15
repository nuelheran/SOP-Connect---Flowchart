import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { Avatar, Icon, StatusPill, errMsg, useToast } from '../components/ui';
import { api } from '../data';
import { renderFlow } from '../lib/flow';
import { ROLE_LABEL, displayName, relTime, roleOf } from '../lib/format';
import { blankSteps, exampleContent, sanitizeSteps } from '../lib/steps';
import type { FlowContent, FlowStatus, Flowchart } from '../lib/types';

type Scope = 'all' | 'mine' | 'shared';

export default function RepoPage() {
  const { me } = useAuth();
  const toast = useToast();
  const nav = useNavigate();
  const [list, setList] = useState<Flowchart[] | null>(null);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [scope, setScope] = useState<Scope>('all');
  const [status, setStatus] = useState<'all' | FlowStatus>('all');
  const [creating, setCreating] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    try { setError(''); setList(await api.listFlowcharts()); }
    catch (e) { setError(errMsg(e)); setList([]); }
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (list ?? []).filter((f) => {
      if (status !== 'all' && f.status !== status) return false;
      if (scope === 'mine' && f.owner_id !== me?.id) return false;
      if (scope === 'shared' && !f.access.some((a) => a.user_id === me?.id)) return false;
      if (term && !`${f.title} ${f.code} ${f.unit} ${f.steps.map((s) => s.lane).join(' ')} ${displayName(f.owner)}`.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [list, q, scope, status, me?.id]);

  const count = (s: FlowStatus) => (list ?? []).filter((f) => f.status === s).length;

  async function create(content: FlowContent, log?: string) {
    setCreating(true);
    try {
      const id = await api.createFlowchart(content);
      if (log) await api.logActivity(id, 'import', log).catch(() => {});
      nav(`/f/${id}`);
    } catch (e) { toast(errMsg(e), 'err'); setCreating(false); }
  }

  function importFile(file?: File) {
    if (!file) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        const j = JSON.parse(String(r.result));
        const f = j.flowchart ?? j;
        const steps = sanitizeSteps(f.steps);
        if (!steps.length) throw new Error();
        create({ title: String(f.title ?? 'Flowchart impor').slice(0, 200), code: String(f.code ?? '').slice(0, 60), unit: String(f.unit ?? '').slice(0, 120),
          description: String(f.description ?? '').slice(0, 4000), status: 'draft', steps }, 'Diimpor dari berkas JSON');
      } catch { toast('Berkas bukan ekspor JSON FLOWCRAFT yang valid.', 'err'); }
    };
    r.readAsText(file);
  }

  const newBlank = () => create({ title: '', code: '', unit: me?.unit ?? '', description: '', status: 'draft', steps: blankSteps() });

  return (
    <main className="page wrap">
      <div className="page-head">
        <div>
          <div className="eyebrow">Database flowchart</div>
          <h1>Repositori Flowchart SOP</h1>
          <p>Satu sumber kebenaran untuk alur proses. Process owner menyusun, menyimpan, dan membagikan flowchart SOP-nya sendiri.</p>
        </div>
        <div className="actions">
          <button className="btn" onClick={() => fileRef.current?.click()} disabled={creating}><Icon name="upload" />Impor JSON</button>
          <button className="btn primary" onClick={newBlank} disabled={creating}><Icon name="plus" />Flowchart baru</button>
          <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={(e) => { importFile(e.target.files?.[0]); e.target.value = ''; }} />
        </div>
      </div>

      {api.mode === 'demo' && <div className="banner warn"><b>Mode demo.</b> Aplikasi belum terhubung ke Supabase, jadi data hanya tersimpan di browser ini. Lihat README untuk menghubungkan database.</div>}
      {error && <div className="banner err">{error} <button className="btn sm" onClick={load}>Coba lagi</button></div>}

      <div className="stats">
        <div className="stat"><b>{list?.length ?? '–'}</b><span>Total flowchart</span></div>
        <div className="stat"><b>{list ? count('final') : '–'}</b><span>Final</span></div>
        <div className="stat"><b>{list ? count('review') : '–'}</b><span>Dalam review</span></div>
        <div className="stat"><b>{list ? count('draft') : '–'}</b><span>Draft</span></div>
      </div>

      <div className="controls">
        <label className="search"><Icon name="search" /><input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari judul, kode SOP, unit, pelaksana, atau pemilik" aria-label="Cari flowchart" /></label>
        <div className="seg" role="group" aria-label="Kepemilikan">
          {([['all', 'Semua'], ['mine', 'Milik saya'], ['shared', 'Dibagikan ke saya']] as [Scope, string][]).map(([k, l]) => (
            <button key={k} aria-pressed={scope === k} onClick={() => setScope(k)}>{l}</button>
          ))}
        </div>
        <select className="input" style={{ width: 'auto' }} value={status} onChange={(e) => setStatus(e.target.value as 'all' | FlowStatus)} aria-label="Filter status">
          <option value="all">Semua status</option><option value="draft">Draft</option><option value="review">Review</option><option value="final">Final</option>
        </select>
      </div>

      {list === null ? (
        <div className="grid"><div className="skeleton" /><div className="skeleton" /><div className="skeleton" /></div>
      ) : list.length === 0 && !error ? (
        <div className="empty">
          <h2>Belum ada flowchart di database</h2>
          <p>Mulai dengan menuliskan aktivitas proses Anda. FLOWCRAFT menyusun flowchart swimlane-nya secara otomatis.</p>
          <div className="actions" style={{ justifyContent: 'center' }}>
            <button className="btn primary" onClick={newBlank} disabled={creating}><Icon name="plus" />Buat flowchart</button>
            <button className="btn" onClick={() => create(exampleContent(), 'Dibuat dari contoh')} disabled={creating}>Coba dengan contoh</button>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty"><h2>Tidak ada yang cocok</h2><p>Ubah kata kunci pencarian atau filter.</p></div>
      ) : (
        <div className="grid">{filtered.map((f) => <FlowCard key={f.id} f={f} />)}</div>
      )}
    </main>
  );
}

function FlowCard({ f }: { f: Flowchart }) {
  const { me } = useAuth();
  const svg = useMemo(() => renderFlow(f, { compact: true }).svg.replace(/ width="\d+(\.\d+)?" height="\d+(\.\d+)?"/, ''), [f]);
  const r = roleOf(f, me);
  return (
    <Link className="card" to={`/f/${f.id}`} aria-label={`Buka ${f.title || 'flowchart tanpa judul'}`}>
      <div className="thumb" aria-hidden="true" dangerouslySetInnerHTML={{ __html: svg }} />
      <div className="card-body">
        <div className="card-top">
          <span className="mono note">{f.code || '—'}</span>
          <span style={{ display: 'flex', gap: 6 }}>
            {f.visibility === 'restricted' && <span className="pill role">Terbatas</span>}
            <StatusPill status={f.status} />
          </span>
        </div>
        <h3>{f.title || 'Flowchart tanpa judul'}</h3>
        <div className="note">{f.unit || 'Unit belum diisi'}</div>
        <div className="card-foot">
          <Avatar person={f.owner} size={22} /><span>{displayName(f.owner)}</span>
          <span className="dot">•</span><span className="mono">{f.version ? 'v' + f.version : 'draf'}</span>
          <span className="dot">•</span><span>{f.steps.length} langkah</span>
          <span className="dot">•</span><span>{relTime(f.updated_at)}</span>
          {r && r !== 'viewer' && <><span className="dot">•</span><span>{ROLE_LABEL[r]}</span></>}
        </div>
      </div>
    </Link>
  );
}
