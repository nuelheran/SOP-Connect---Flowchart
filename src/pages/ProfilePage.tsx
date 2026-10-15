import { useState, type FormEvent } from 'react';
import { useAuth } from '../auth/AuthContext';
import { errMsg, useToast } from '../components/ui';
import { api } from '../data';

export default function ProfilePage() {
  const { me, refresh } = useAuth();
  const toast = useToast();
  const [fullName, setFullName] = useState(me?.full_name ?? '');
  const [unit, setUnit] = useState(me?.unit ?? '');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);

  async function saveProfile(e: FormEvent) {
    e.preventDefault(); setBusy(true);
    try { await api.updateMyProfile(fullName, unit); await refresh(); toast('Profil disimpan'); }
    catch (err) { toast(errMsg(err), 'err'); } finally { setBusy(false); }
  }
  async function savePw(e: FormEvent) {
    e.preventDefault();
    if (pw.length < 8) return toast('Kata sandi minimal 8 karakter.', 'err');
    setBusy(true);
    try { await api.updatePassword(pw); setPw(''); toast('Kata sandi diperbarui'); }
    catch (err) { toast(errMsg(err), 'err'); } finally { setBusy(false); }
  }

  return (
    <main className="page wrap">
      <div className="page-head"><div><div className="eyebrow">Akun</div><h1>Profil saya</h1><p>Nama dan unit Anda tampil saat rekan berbagi akses flowchart.</p></div></div>
      <form className="panel-box" onSubmit={saveProfile}>
        <h3>Data diri</h3>
        <div className="form-grid">
          <label className="fld full"><span>Email</span><input className="input" value={me?.email ?? ''} readOnly /></label>
          <label className="fld"><span>Nama lengkap</span><input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} required /></label>
          <label className="fld"><span>Unit / departemen</span><input className="input" value={unit} onChange={(e) => setUnit(e.target.value)} /></label>
        </div>
        <div><button className="btn primary" disabled={busy}>Simpan profil</button></div>
      </form>
      {api.mode === 'supabase' && (
        <form className="panel-box" onSubmit={savePw}>
          <h3>Ganti kata sandi</h3>
          <label className="fld"><span>Kata sandi baru</span><input className="input" type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" minLength={8} /></label>
          <div><button className="btn" disabled={busy || !pw}>Perbarui kata sandi</button></div>
        </form>
      )}
    </main>
  );
}
