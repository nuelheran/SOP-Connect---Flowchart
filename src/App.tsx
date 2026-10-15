import { Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './auth/AuthContext';
import { TopBar } from './components/TopBar';
import AdminPage from './pages/AdminPage';
import EditorPage from './pages/EditorPage';
import LoginPage, { RecoveryPage } from './pages/LoginPage';
import ProfilePage from './pages/ProfilePage';
import RepoPage from './pages/RepoPage';

export default function App() {
  const { me, loading, recovery } = useAuth();
  const loc = useLocation();
  const isEditor = loc.pathname.startsWith('/f/');

  if (loading) return <div className="app"><div className="center">Memuat FLOWCRAFT…</div></div>;
  if (recovery) return <div className="app"><RecoveryPage /></div>;
  if (!me) return <div className="app"><LoginPage /></div>;

  return (
    <div className={'app' + (isEditor ? ' fill' : '')}>
      <TopBar />
      <Routes>
        <Route path="/" element={<RepoPage />} />
        <Route path="/f/:id" element={<EditorPage />} />
        <Route path="/profil" element={<ProfilePage />} />
        <Route path="/admin" element={me.role === 'admin' ? <AdminPage /> : <NotFound />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </div>
  );
}

function NotFound() {
  return <div className="center"><div><h2>Halaman tidak ditemukan</h2><p><a href="/">Kembali ke repositori</a></p></div></div>;
}
