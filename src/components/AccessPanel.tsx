import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { api } from '../data';
import { laneList, UNASSIGNED_LANE } from '../lib/flow';
import { displayName, fmtDateTime } from '../lib/format';
import type { AccessRole, FlowContent, Flowchart, Person, Visibility } from '../lib/types';
import { Avatar, ConfirmDialog, Icon, errMsg, useToast } from './ui';

interface Props {
  flow: Flowchart;
  editable: boolean;
  manageable: boolean;
  onPatch: (p: Partial<FlowContent>) => void;
  /** Muat ulang data dari server setelah perubahan akses. */
  onReload: () => Promise<void>;
  onDuplicate: () => void;
  onDeleted: () => void;
}

export default function AccessPanel({ flow, editable, manageable, onPatch, onReload, onDuplicate, onDeleted }: Props) {
  const { me } = useAuth();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Person[] | null>(null);
  const [newRole, setNewRole] = useState<AccessRole>('reader');
  const [transferTo, setTransferTo] = useState('');
  const [confirm, setConfirm] = useState<null | 'delete' | 'transfer'>(null);
  const timer = useRef<number>();
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (hits === null) return;
    const close = (e: MouseEvent) => { if (!pickerRef.current?.contains(e.target as Node)) setHits(null); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [hits]);

  const search = (text: string) => {
    setQ(text);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(async () => {
      try {
        const taken = new Set([flow.owner_id, ...flow.access.map((a) => a.user_id)]);
        setHits((await api.searchPeople(text)).filter((p) => !taken.has(p.id)));
      } catch (e) { toast(errMsg(e), 'err'); }
    }, 200);
  };

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try { await fn(); await onReload(); toast(ok); } catch (e) { toast(errMsg(e), 'err'); }
  };

  const lanes = laneList(flow.steps).filter((l) => l !== UNASSIGNED_LANE);

  return (
    <>
      <div className="sect">
        <h3>Informasi dokumen</h3>
        <div className="form-grid">
          <label className="fld"><span>Kode SOP</span><input className="input" value={flow.code} readOnly={!editable} placeholder="mis. SOP-HR-012" onChange={(e) => onPatch({ code: e.target.value })} /></label>
          <label className="fld"><span>Unit / departemen</span><input className="input" value={flow.unit} readOnly={!editable} placeholder="mis. Human Resources" onChange={(e) => onPatch({ unit: e.target.value })} /></label>
          <label className="fld full"><span>Tujuan / deskripsi singkat</span><textarea className="input" rows={3} value={flow.description} readOnly={!editable} placeholder="Untuk apa proses ini dijalankan" onChange={(e) => onPatch({ description: e.target.value })} /></label>
        </div>
        <div className="note">Pelaksana: {lanes.length ? lanes.join(', ') : 'belum ada'}. Dibuat {fmtDateTime(flow.created_at)}.</div>
      </div>

      <div className="sect">
        <h3>Pemilik proses</h3>
        <div className="person"><Avatar person={flow.owner} /><span className="nm">{displayName(flow.owner)}{flow.owner_id === me?.id && ' (Anda)'}<small>{flow.owner?.email}</small></span><span className="pill role">Pemilik</span></div>
        {manageable && flow.access.length > 0 && (
          <label className="fld"><span>Alihkan kepemilikan ke</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <select className="input" value={transferTo} onChange={(e) => setTransferTo(e.target.value)}>
                <option value="">— pilih orang dengan akses —</option>
                {flow.access.map((a) => <option key={a.user_id} value={a.user_id}>{displayName(a.person)}</option>)}
              </select>
              <button className="btn" disabled={!transferTo} onClick={() => setConfirm('transfer')}>Alihkan</button>
            </div>
          </label>
        )}
      </div>

      <div className="sect">
        <h3>Siapa yang dapat melihat</h3>
        {(['org', 'restricted'] as Visibility[]).map((v) => (
          <label key={v} className="radio">
            <input type="radio" name="vis" checked={flow.visibility === v} disabled={!manageable}
              onChange={() => run(() => api.setVisibility(flow.id, v), v === 'org' ? 'Terlihat oleh semua pengguna' : 'Dibatasi untuk orang yang diberi akses')} />
            <span>{v === 'org'
              ? <><b>Semua pengguna aplikasi</b><small>Tampil di repositori untuk semua orang. Hanya pemilik dan editor yang dapat mengubah.</small></>
              : <><b>Hanya orang yang diberi akses</b><small>Disembunyikan dari pengguna lain. Admin aplikasi tetap dapat melihat.</small></>}
            </span>
          </label>
        ))}
      </div>

      <div className="sect">
        <h3>Akses dokumen</h3>
        {manageable && (
          <div style={{ display: 'flex', gap: 8 }}>
            <div className="picker" ref={pickerRef} style={{ flex: 1 }}>
              <input className="input" value={q} placeholder="Cari nama atau email rekan" autoComplete="off" aria-label="Cari rekan"
                onFocus={() => search(q)} onChange={(e) => search(e.target.value)} />
              {hits && (
                <div className="results">
                  {hits.length ? hits.map((p) => (
                    <button key={p.id} onClick={() => { setHits(null); setQ(''); run(() => api.grantAccess(flow.id, p.id, newRole), `${displayName(p)} ditambahkan sebagai ${newRole === 'editor' ? 'Editor' : 'Pembaca'}`); }}>
                      <Avatar person={p} size={24} /><span>{displayName(p)}<small>{p.email}{p.unit ? ' · ' + p.unit : ''}</small></span>
                    </button>
                  )) : <div className="note" style={{ padding: 10 }}>Tidak ditemukan. Rekan perlu mendaftar ke aplikasi terlebih dahulu.</div>}
                </div>
              )}
            </div>
            <select className="input" style={{ width: 'auto' }} value={newRole} onChange={(e) => setNewRole(e.target.value as AccessRole)} aria-label="Peran untuk orang yang ditambahkan">
              <option value="reader">Pembaca</option><option value="editor">Editor</option>
            </select>
          </div>
        )}
        <div>
          {flow.access.length === 0 && <div className="note">Belum ada orang lain yang diberi akses khusus.</div>}
          {flow.access.map((a) => (
            <div className="person" key={a.user_id}>
              <Avatar person={a.person} />
              <span className="nm">{displayName(a.person)}{a.user_id === me?.id && ' (Anda)'}<small>{a.person?.email}</small></span>
              {manageable ? (
                <>
                  <select className="input" value={a.role} aria-label={`Peran ${displayName(a.person)}`}
                    onChange={(e) => run(() => api.grantAccess(flow.id, a.user_id, e.target.value as AccessRole), 'Peran diperbarui')}>
                    <option value="editor">Editor</option><option value="reader">Pembaca</option>
                  </select>
                  <button className="icon-btn del" aria-label={`Cabut akses ${displayName(a.person)}`} onClick={() => run(() => api.revokeAccess(flow.id, a.user_id), 'Akses dicabut')}><Icon name="x" /></button>
                </>
              ) : <span className="pill role">{a.role === 'editor' ? 'Editor' : 'Pembaca'}</span>}
            </div>
          ))}
        </div>
        <div className="note">Editor dapat mengubah isi dan menyimpan versi. Pembaca hanya dapat melihat dan mengunduh. Hanya pemilik yang mengatur akses.</div>
      </div>

      <div className="sect">
        <h3>Kelola dokumen</h3>
        <div className="actions">
          <button className="btn" onClick={onDuplicate}><Icon name="copy" />{manageable ? 'Duplikat' : 'Duplikat sebagai milik saya'}</button>
          {manageable && <button className="btn danger" onClick={() => setConfirm('delete')}><Icon name="trash" />Hapus flowchart</button>}
        </div>
      </div>

      {confirm === 'delete' && (
        <ConfirmDialog title="Hapus flowchart ini?" danger confirmLabel="Hapus permanen" onClose={() => setConfirm(null)}
          body={<p style={{ margin: 0 }}>"{flow.title || 'Flowchart tanpa judul'}" beserta semua versi dan riwayatnya akan dihapus untuk semua pengguna. Unduh JSON terlebih dahulu bila perlu cadangan.</p>}
          onConfirm={async () => { try { await api.deleteFlowchart(flow.id); toast('Flowchart dihapus'); onDeleted(); } catch (e) { toast(errMsg(e), 'err'); } }} />
      )}
      {confirm === 'transfer' && (
        <ConfirmDialog title="Alihkan kepemilikan?" confirmLabel="Alihkan" onClose={() => setConfirm(null)}
          body={<p style={{ margin: 0 }}>{displayName(flow.access.find((a) => a.user_id === transferTo)?.person)} akan menjadi pemilik proses dan mengatur akses. Anda tetap dapat mengubah sebagai Editor.</p>}
          onConfirm={() => run(() => api.transferOwnership(flow.id, transferTo), 'Kepemilikan dialihkan').then(() => setTransferTo(''))} />
      )}
    </>
  );
}
