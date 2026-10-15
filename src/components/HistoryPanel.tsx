import { useEffect, useMemo, useState } from 'react';
import { api } from '../data';
import { renderFlow } from '../lib/flow';
import { displayName, fmtDateTime } from '../lib/format';
import type { ActivityEntry, Flowchart, VersionEntry } from '../lib/types';
import { ConfirmDialog, Icon, Modal, errMsg, useToast } from './ui';
import { preferredView } from './FlowPreview';

interface Props { flow: Flowchart; editable: boolean; refreshKey: number; onRestored: () => Promise<void>; }

export default function HistoryPanel({ flow, editable, refreshKey, onRestored }: Props) {
  const toast = useToast();
  const [versions, setVersions] = useState<VersionEntry[] | null>(null);
  const [activity, setActivity] = useState<ActivityEntry[] | null>(null);
  const [view, setView] = useState<VersionEntry | null>(null);
  const [restore, setRestore] = useState<VersionEntry | null>(null);

  useEffect(() => {
    let alive = true;
    Promise.all([api.listVersions(flow.id), api.listActivity(flow.id)])
      .then(([v, a]) => { if (alive) { setVersions(v); setActivity(a); } })
      .catch((e) => toast(errMsg(e), 'err'));
    return () => { alive = false; };
  }, [flow.id, refreshKey, toast]);

  return (
    <>
      <div className="sect">
        <h3>Versi tersimpan</h3>
        {versions === null ? <div className="note">Memuat…</div> : versions.length === 0
          ? <div className="note">Belum ada versi. Gunakan "Simpan versi" saat flowchart siap direview atau disahkan.</div>
          : versions.map((v) => (
            <div className="ver" key={v.version}>
              <span className="v">v{v.version}</span>
              <span className="meta">{v.note || <span className="muted">Tanpa catatan</span>}<small>{displayName(v.author)} · {fmtDateTime(v.created_at)} · {v.steps.length} langkah</small></span>
              <button className="btn sm" onClick={() => setView(v)}><Icon name="eye" />Lihat</button>
              {editable && <button className="btn sm" onClick={() => setRestore(v)}><Icon name="restore" />Pulihkan</button>}
            </div>
          ))}
      </div>
      <div className="sect">
        <h3>Riwayat aktivitas</h3>
        {activity === null ? <div className="note">Memuat…</div> : activity.length === 0 ? <div className="note">Belum ada riwayat.</div>
          : activity.map((a) => (
            <div className="log-item" key={a.id}>
              <time>{fmtDateTime(a.created_at)}</time>
              <div>{a.detail}<div className="note">{a.actor ? displayName(a.actor) : 'Sistem'}</div></div>
            </div>
          ))}
      </div>
      {view && <VersionView flow={flow} v={view} onClose={() => setView(null)} />}
      {restore && (
        <ConfirmDialog title={`Pulihkan isi ke versi ${restore.version}?`} confirmLabel="Pulihkan" onClose={() => setRestore(null)}
          body={<p style={{ margin: 0 }}>Judul dan langkah saat ini akan diganti dengan isi versi {restore.version}. Simpan versi dulu bila isi saat ini perlu disimpan.</p>}
          onConfirm={async () => { try { await api.restoreVersion(flow.id, restore.version); await onRestored(); toast(`Dipulihkan ke versi ${restore.version}`); } catch (e) { toast(errMsg(e), 'err'); } }} />
      )}
    </>
  );
}

function VersionView({ flow, v, onClose }: { flow: Flowchart; v: VersionEntry; onClose: () => void }) {
  const svg = useMemo(() => renderFlow({ ...flow, title: v.title, steps: v.steps, version: v.version, updated_at: v.created_at }, preferredView()).svg
    .replace(/ width="\d+(\.\d+)?" height="\d+(\.\d+)?"/, ' style="width:100%;height:auto"'), [flow, v]);
  return (
    <Modal title={`Versi ${v.version}${v.note ? ' · ' + v.note : ''}`} onClose={onClose} wide>
      <div style={{ overflow: 'auto', border: '1px solid var(--line)', borderRadius: 12, background: '#fff', maxHeight: '70vh' }} dangerouslySetInnerHTML={{ __html: svg }} />
      <div className="row"><button className="btn" onClick={onClose}>Tutup</button></div>
    </Modal>
  );
}
