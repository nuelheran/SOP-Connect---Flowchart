import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { api } from '../data';
import { displayName } from '../lib/format';
import { Avatar, BrandMark, Icon } from './ui';

export function TopBar() {
  const { me } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const nav = useNavigate();

  useEffect(() => {
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  return (
    <header className="topbar">
      <div className="topbar-in wrap">
        <Link to="/" className="brand" aria-label="FLOWCRAFT, ke repositori">
          <BrandMark /><span className="brand-name">FLOWCRAFT</span><span className="brand-sub">SOPConnect · by DigiGovern</span>
        </Link>
        <nav className="nav" aria-label="Navigasi utama">
          <NavLink to="/" end>Repositori</NavLink>
          {me?.role === 'admin' && <NavLink to="/admin">Admin</NavLink>}
        </nav>
        <span className="spacer" />
        {api.mode === 'demo' && <span className="chip-demo" title="Data hanya tersimpan di browser ini">Mode demo</span>}
        {me && (
          <div className="usermenu" ref={ref}>
            <button onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open}>
              <Avatar person={me} /><span className="uname">{displayName(me)}</span>
            </button>
            {open && (
              <div className="menu" role="menu">
                <div className="who"><b>{displayName(me)}</b><span className="note">{me.email}</span>{me.unit && <div className="note">{me.unit}</div>}</div>
                <Link to="/profil" role="menuitem" onClick={() => setOpen(false)}><Icon name="user" />Profil & kata sandi</Link>
                {me.role === 'admin' && <Link to="/admin" role="menuitem" onClick={() => setOpen(false)}><Icon name="shield" />Admin</Link>}
                <button role="menuitem" onClick={async () => { setOpen(false); await api.signOut(); nav('/'); }}><Icon name="out" />Keluar</button>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
