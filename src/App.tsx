import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { LoginPage } from './pages/LoginPage';
import { Dashboard } from './pages/Dashboard';
import { ShareLinkPlayer } from './pages/ShareLinkPlayer';

function AppRoutes() {
  const { session, loading } = useAuth();

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', color:'rgba(232,228,220,0.3)', fontFamily:"'Syne',sans-serif" }}>
      Loading…
    </div>
  );

  return (
    <Routes>
      {/* Public share link — always accessible, no login needed */}
      <Route path="/p/:slug" element={<ShareLinkPlayer />} />
      {/* Private dashboard — redirect to login if not authed */}
      <Route path="/*" element={session ? <Dashboard /> : <LoginPage />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}
