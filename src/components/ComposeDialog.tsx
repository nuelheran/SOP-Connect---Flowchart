import { useState } from 'react';
import { api } from '../data';
import { parseQuickList } from '../lib/steps';
import type { Step } from '../lib/types';
import { Icon, Modal, errMsg } from './ui';

interface Props {
  hasSteps: boolean;
  onApply: (steps: Step[], title: string, source: 'list' | 'ai') => void;
  onClose: () => void;
}

const LIST_SAMPLE = `Karyawan: Mengisi formulir pengajuan cuti
Atasan: Memeriksa jadwal tim
Atasan: Cuti disetujui?
HR: Mencatat cuti di sistem
HR: [D] Mengirim konfirmasi cuti`;

export default function ComposeDialog({ hasSteps, onApply, onClose }: Props) {
  const [mode, setMode] = useState<'list' | 'ai'>(api.aiEnabled ? 'ai' : 'list');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function go() {
    setErr('');
    if (!text.trim()) return setErr('Isi dulu teksnya.');
    if (mode === 'list') {
      const steps = parseQuickList(text);
      if (!steps.length) return setErr('Tidak ada baris yang bisa dibaca.');
      onApply(steps, '', 'list');
      return;
    }
    setBusy(true);
    try { const r = await api.generateSteps(text); onApply(r.steps, r.title, 'ai'); }
    catch (e) { setErr(errMsg(e)); }
    finally { setBusy(false); }
  }

  return (
    <Modal title="Susun langkah otomatis" onClose={onClose} busy={busy}>
      {api.aiEnabled && (
        <div className="seg" role="group">
          <button aria-pressed={mode === 'list'} onClick={() => setMode('list')}>Daftar cepat</button>
          <button aria-pressed={mode === 'ai'} onClick={() => setMode('ai')}>Dari narasi (AI)</button>
        </div>
      )}
      {mode === 'ai' ? (
        <>
          <p className="note" style={{ margin: 0 }}>Ceritakan proses seperti menjelaskan ke rekan baru: siapa melakukan apa, kapan ada persetujuan, dan apa yang terjadi bila ditolak. AI menyusunnya menjadi langkah, lalu Anda periksa dan koreksi.</p>
          <textarea className="input" rows={9} value={text} onChange={(e) => setText(e.target.value)} disabled={busy}
            placeholder="Contoh: Karyawan mengajukan cuti lewat formulir. Atasan memeriksa jadwal tim lalu menyetujui atau menolak. Jika disetujui, HR mencatat cuti di sistem dan mengirim konfirmasi ke karyawan. Jika ditolak, karyawan menerima pemberitahuan." />
        </>
      ) : (
        <>
          <p className="note" style={{ margin: 0 }}>Satu aktivitas per baris dengan format <b>Pelaksana: aktivitas</b>. Baris diakhiri "?" menjadi Keputusan, awali dengan [D] untuk Dokumen. Pelaksana boleh dikosongkan bila sama dengan baris sebelumnya. Mulai dan Selesai ditambahkan otomatis.</p>
          <pre>{LIST_SAMPLE}</pre>
          <textarea className="input" rows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder="Pelaksana: aktivitas" />
        </>
      )}
      {hasSteps && <div className="banner warn">Langkah yang sudah ada akan diganti dengan hasil susunan baru.</div>}
      {err && <div className="banner err" role="alert">{err}</div>}
      <div className="row">
        <button className="btn" onClick={onClose} disabled={busy}>Batal</button>
        <button className="btn primary" onClick={go} disabled={busy}>
          {busy ? 'Menyusun… (bisa 10–30 detik)' : mode === 'ai' ? <><Icon name="spark" />Susun dengan AI</> : 'Susun flowchart'}
        </button>
      </div>
    </Modal>
  );
}
