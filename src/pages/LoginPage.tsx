import { useMemo, useState, type FormEvent } from 'react';
import { useAuth } from '../auth/AuthContext';
import { BrandMark, errMsg } from '../components/ui';
import { api } from '../data';
import { renderFlow } from '../lib/flow';
import { exampleContent } from '../lib/steps';

type Mode = 'login' | 'signup' | 'reset';

export default function LoginPage() {
  const { refresh } = useAuth();
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [unit, setUnit] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const preview = useMemo(() => renderFlow({ ...exampleContent(), version: 1, status: 'final' }, { table: false }).svg, []);
  const demo = api.mode === 'demo';

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    try {
      if (mode === 'login') { await api.signIn(email, password); await refresh(); }
      else if (mode === 'signup') {
        if (!fullName.trim()) throw new Error('Nama lengkap wajib diisi.');
        if (password.length < 8) throw new Error('Kata sandi minimal 8 karakter.');
        const r = await api.signUp(email, password, fullName, unit);
        if (r.needsConfirmation) { setMsg({ kind: 'ok', text: 'Akun dibuat. Buka email Anda dan klik tautan konfirmasi, lalu masuk.' }); setMode('login'); }
        else await refresh();
      } else {
        await api.sendPasswordReset(email);
        setMsg({ kind: 'ok', text: 'Jika email terdaftar, tautan untuk membuat kata sandi baru sudah dikirim.' });
      }
    } catch (err) { setMsg({ kind: 'err', text: errMsg(err) }); }
    finally { setBusy(false); }
  }

  return (
    <div className="auth">
      <section className="auth-side" aria-label="Tentang FLOWCRAFT">
        <div className="brand"><BrandMark /><span className="brand-name">FLOWCRAFT</span><span className="brand-sub" style={{ borderColor: 'rgba(255,255,255,.25)', color: 'inherit', opacity: .7 }}>SOPConnect · by DigiGovern</span></div>
        <h1>Tulis aktivitasnya, flowchart SOP tersusun sendiri.</h1>
        <p>Process owner menyusun SOP-nya secara mandiri. Flowchart tersimpan di satu repositori yang dapat dipercaya, lengkap dengan pemilik, hak akses, dan riwayat versinya.</p>
        <div className="auth-steps">
          <div><b>01</b>Input aktivitas yang dijalankan</div>
          <div><b>02</b>Flowchart dibuat otomatis</div>
          <div><b>03</b>Unduh flowchart</div>
          <div><b>04</b>Susun dokumen SOP</div>
        </div>
        <div className="auth-preview" dangerouslySetInnerHTML={{ __html: preview }} />
      </section>
      <main className="auth-main">
        <form className="auth-card" onSubmit={submit}>
          <h2>{mode === 'login' ? 'Masuk' : mode === 'signup' ? 'Buat akun' : 'Lupa kata sandi'}</h2>
          {demo && <div className="banner warn">Mode demo: belum terhubung ke database. Masukkan email apa pun untuk mencoba; data hanya tersimpan di browser ini.</div>}
          {mode !== 'reset' && (
            <div className="seg" role="group" aria-label="Pilih">
              <button type="button" aria-pressed={mode === 'login'} onClick={() => { setMode('login'); setMsg(null); }}>Masuk</button>
              <button type="button" aria-pressed={mode === 'signup'} onClick={() => { setMode('signup'); setMsg(null); }}>Daftar</button>
            </div>
          )}
          {mode === 'signup' && (
            <>
              <label className="fld"><span>Nama lengkap</span><input id="fullName" className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" required /></label>
              <label className="fld"><span>Unit / departemen</span><input id="unit" className="input" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="mis. Human Resources" /></label>
            </>
          )}
          <label className="fld"><span>Email kantor</span><input id="email" className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required /></label>
          {mode !== 'reset' && (
            <label className="fld"><span>Kata sandi</span><input id="password" className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} required={!demo} minLength={demo ? undefined : mode === 'signup' ? 8 : 6} /></label>
          )}
          {msg && <div className={'banner ' + (msg.kind === 'err' ? 'err' : 'ok')} role="alert">{msg.text}</div>}
          <button className="btn primary block" disabled={busy}>
            {busy ? 'Memproses…' : mode === 'login' ? 'Masuk' : mode === 'signup' ? 'Buat akun' : 'Kirim tautan reset'}
          </button>
          {mode === 'login' && !demo && <button type="button" className="linkbtn" onClick={() => { setMode('reset'); setMsg(null); }}>Lupa kata sandi?</button>}
          {mode === 'reset' && <button type="button" className="linkbtn" onClick={() => { setMode('login'); setMsg(null); }}>Kembali ke halaman masuk</button>}
        </form>
      </main>
    </div>
  );
}

export function RecoveryPage() {
  const { clearRecovery, refresh } = useAuth();
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  async function submit(e: FormEvent) {
    e.preventDefault(); setErr('');
    if (pw.length < 8) return setErr('Kata sandi minimal 8 karakter.');
    if (pw !== pw2) return setErr('Kedua kata sandi tidak sama.');
    setBusy(true);
    try { await api.updatePassword(pw); clearRecovery(); await refresh(); }
    catch (e2) { setErr(errMsg(e2)); }
    finally { setBusy(false); }
  }
  return (
    <div className="center">
      <form className="auth-card" onSubmit={submit} style={{ textAlign: 'left' }}>
        <h2>Buat kata sandi baru</h2>
        <label className="fld"><span>Kata sandi baru</span><input className="input" type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" /></label>
        <label className="fld"><span>Ulangi kata sandi</span><input className="input" type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" /></label>
        {err && <div className="banner err" role="alert">{err}</div>}
        <button className="btn primary block" disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan kata sandi'}</button>
      </form>
    </div>
  );
}
