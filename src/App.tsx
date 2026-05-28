import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { LoginPage } from './pages/LoginPage';
import { Dashboard } from './pages/Dashboard';
import { ShareLinkPlayer } from './pages/ShareLinkPlayer';

function AppRoutes() {
  const { session, loading } = useAuth();

  return (
    <Routes>
      {/* Public share link — renders immediately, no auth check at all */}
      <Route path="/p/:slug" element={<ShareLinkPlayer />} />

      {/* Private routes — wait for auth */}
      <Route path="/*" element={
        loading
          ? <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh' }}>
              <div style={{ width:24, height:24, border:'2px solid rgba(255,255,255,0.1)', borderTop:'2px solid #c9f55e', borderRadius:'50%', animation:'spin 0.8s linear infinite' }} />
            </div>
          : session ? <Dashboard /> : <LoginPage />
      } />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Share link is OUTSIDE AuthProvider entirely — zero auth overhead */}
        <Route path="/p/:slug" element={<ShareLinkPlayer />} />

        {/* Everything else goes through auth */}
        <Route path="/*" element={
          <AuthProvider>
            <AuthRoutes />
          </AuthProvider>
        } />
      </Routes>
    </BrowserRouter>
  );
}

function AuthRoutes() {
  const { session, loading } = useAuth();

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', background:'#0a0a0b' }}>
      <div style={{ width:24, height:24, border:'2px solid rgba(255,255,255,0.1)', borderTop:'2px solid #c9f55e', borderRadius:'50%', animation:'spin 0.8s linear infinite' }} />
    </div>
  );

  return (
    <Routes>
      <Route path="/*" element={session ? <Dashboard /> : <LoginPage />} />
    </Routes>
  );
}
