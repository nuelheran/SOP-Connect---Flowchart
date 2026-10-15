import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { Avatar, errMsg, useToast } from '../components/ui';
import { api } from '../data';
import { displayName, fmtDateTime } from '../lib/format';
import type { Profile } from '../lib/types';

export default function AdminPage() {
  const { me, refresh } = useAuth();
  const toast = useToast();
  const [users, setUsers] = useState<Profile[] | null>(null);
  const [domain, setDomain] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const [u, s] = await Promise.all([api.listUsers(), api.getSettings()]);
      setUsers(u); setDomain(s.allowed_email_domain ?? '');
    } catch (e) { toast(errMsg(e), 'err'); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  async function setRole(u: Profile, role: 'user' | 'admin') {
    try { await api.setUserRole(u.id, role); toast(`${displayName(u)} sekarang ${role === 'admin' ? 'admin' : 'pengguna biasa'}`); await load(); if (u.id === me?.id) await refresh(); }
    catch (e) { toast(errMsg(e), 'err'); }
  }
  async function saveDomain() {
    setBusy(true);
    try { await api.setAllowedDomain(domain); toast(domain.trim() ? `Pendaftaran dibatasi ke @${domain.trim().replace(/^@/, '')}` : 'Pendaftaran terbuka untuk semua email'); await load(); }
    catch (e) { toast(errMsg(e), 'err'); } finally { setBusy(false); }
  }

  return (
    <main className="page wrap">
      <div className="page-head"><div><div className="eyebrow">Admin aplikasi</div><h1>Pengguna & pengaturan</h1>
        <p>Admin dapat melihat dan mengelola semua flowchart, termasuk yang dibatasi, untuk keperluan tata kelola.</p></div></div>

      <section className="panel-box">
        <h3>Batasi pendaftaran ke domain email</h3>
        <p className="note" style={{ margin: 0 }}>Isi domain kantor (mis. perusahaan.co.id) agar hanya email kantor yang dapat mendaftar. Kosongkan untuk mengizinkan semua email selama masa uji coba.</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input className="input" style={{ flex: '1 1 220px' }} placeholder="perusahaan.co.id" value={domain} onChange={(e) => setDomain(e.target.value)} aria-label="Domain email" />
          <button className="btn primary" onClick={saveDomain} disabled={busy}>Simpan</button>
        </div>
      </section>

      <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <h3 style={{ fontSize: 16 }}>Pengguna terdaftar {users && <span className="muted mono" style={{ fontSize: 13 }}>({users.length})</span>}</h3>
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>Nama</th><th>Email</th><th>Unit</th><th>Bergabung</th><th>Peran</th></tr></thead>
            <tbody>
              {!users && <tr><td colSpan={5} className="muted">Memuat…</td></tr>}
              {users?.map((u) => (
                <tr key={u.id}>
                  <td><span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}><Avatar person={u} size={24} />{displayName(u)}{u.id === me?.id && <span className="muted"> (Anda)</span>}</span></td>
                  <td>{u.email}</td>
                  <td>{u.unit || <span className="muted">—</span>}</td>
                  <td className="mono">{fmtDateTime(u.created_at)}</td>
                  <td>
                    <select className="input" style={{ width: 'auto' }} value={u.role} onChange={(e) => setRole(u, e.target.value as 'user' | 'admin')} aria-label={`Peran ${displayName(u)}`}>
                      <option value="user">Pengguna</option><option value="admin">Admin</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
