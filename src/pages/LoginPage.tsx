import { useState } from 'react';
import { supabase } from '../lib/supabase';

export function LoginPage() {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode]         = useState<'login' | 'signup' | 'magic'>('login');
  const [loading, setLoading]   = useState(false);
  const [message, setMessage]   = useState('');
  const [error, setError]       = useState('');

  const handle = async () => {
    if (!email.trim()) { setError('Enter your email.'); return; }
    setLoading(true); setError(''); setMessage('');

    if (mode === 'magic') {
      const { error: err } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: window.location.origin },
      });
      if (err) setError(err.message);
      else setMessage('Check your email — magic link sent!');

    } else if (mode === 'signup') {
      const { error: err } = await supabase.auth.signUp({
        email, password,
        options: { emailRedirectTo: window.location.origin },
      });
      if (err) setError(err.message);
      else setMessage('Account created! Check your email to confirm.');

    } else {
      const { error: err } = await supabase.auth.signInWithPassword({ email, password });
      if (err) setError(err.message);
    }

    setLoading(false);
  };

  return (
    <div style={s.page}>
      {/* Background grain */}
      <div style={s.grain} />

      <div style={s.card}>
        <div style={s.logo}>WAV<span style={{ color: '#c9f55e' }}>R</span></div>
        <p style={s.tagline}>Your studio. Anywhere.</p>

        <div style={s.tabs}>
          {(['login', 'signup', 'magic'] as const).map(m => (
            <button
              key={m}
              style={{ ...s.tab, ...(mode === m ? s.tabActive : {}) }}
              onClick={() => { setMode(m); setError(''); setMessage(''); }}
            >
              {m === 'magic' ? '✉ Magic link' : m === 'signup' ? 'Sign up' : 'Log in'}
            </button>
          ))}
        </div>

        <div style={s.fields}>
          <input
            style={s.input}
            type="email"
            placeholder="Email"
            value={email}
            autoFocus
            onChange={e => setEmail(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handle(); }}
          />
          {mode !== 'magic' && (
            <input
              style={s.input}
              type="password"
              placeholder="Password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handle(); }}
            />
          )}
        </div>

        {error   && <p style={s.error}>{error}</p>}
        {message && <p style={s.success}>{message}</p>}

        <button style={s.btn} onClick={handle} disabled={loading}>
          {loading ? 'One sec…' : mode === 'magic' ? 'Send magic link' : mode === 'signup' ? 'Create account' : 'Log in'}
        </button>

        <p style={s.hint}>
          {mode === 'login'
            ? <>No account? <span style={s.link} onClick={() => setMode('signup')}>Sign up</span></>
            : mode === 'signup'
            ? <>Already have one? <span style={s.link} onClick={() => setMode('login')}>Log in</span></>
            : 'We\'ll email you a one-click login link.'}
        </p>
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    minHeight: '100vh', background: '#0a0a0b', position: 'relative', overflow: 'hidden',
  },
  grain: {
    position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0,
    backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.04'/%3E%3C/svg%3E")`,
    backgroundRepeat: 'repeat', backgroundSize: '128px',
  },
  card: {
    position: 'relative', zIndex: 1,
    background: 'rgba(255,255,255,0.03)',
    border: '0.5px solid rgba(255,255,255,0.08)',
    borderRadius: 16, padding: '44px 40px',
    width: 360, display: 'flex', flexDirection: 'column', gap: 0,
  },
  logo: {
    fontSize: 28, fontWeight: 800, letterSpacing: '-0.05em',
    marginBottom: 6,
  },
  tagline: {
    fontSize: 13, color: 'rgba(232,228,220,0.35)', marginBottom: 28,
  },
  tabs: {
    display: 'flex', gap: 4, marginBottom: 20,
    background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: 3,
  },
  tab: {
    flex: 1, padding: '7px 4px', border: 'none', borderRadius: 6,
    background: 'transparent', color: 'rgba(232,228,220,0.4)',
    fontSize: 12, fontWeight: 600, cursor: 'pointer',
    fontFamily: "'Syne', sans-serif", transition: 'all 0.15s',
  },
  tabActive: {
    background: 'rgba(255,255,255,0.07)', color: '#e8e4dc',
  },
  fields: { display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 },
  input: {
    padding: '12px 14px',
    background: 'rgba(255,255,255,0.04)',
    border: '0.5px solid rgba(255,255,255,0.1)',
    borderRadius: 8, color: '#e8e4dc', fontSize: 14,
    fontFamily: "'Syne', sans-serif", outline: 'none',
  },
  error:   { fontSize: 12, color: '#ff6b6b', marginBottom: 10 },
  success: { fontSize: 12, color: '#c9f55e', marginBottom: 10 },
  btn: {
    padding: '12px', background: '#c9f55e', border: 'none',
    borderRadius: 8, color: '#0a0a0b', fontSize: 14,
    fontWeight: 700, cursor: 'pointer', marginBottom: 16,
    fontFamily: "'Syne', sans-serif",
  },
  hint:  { fontSize: 12, color: 'rgba(232,228,220,0.3)', textAlign: 'center' },
  link:  { color: '#c9f55e', cursor: 'pointer', textDecoration: 'underline' },
};
