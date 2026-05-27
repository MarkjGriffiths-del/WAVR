import { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useAnalytics } from '../hooks/useAnalytics';
import { useAudioEngine } from '../hooks/useAudioEngine';
import { Waveform } from '../components/Waveform';
import { CommentsPanel } from '../components/CommentsPanel';
import './ShareLinkPlayer.css';

const EDGE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/resolve-share-link`;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
const SESSION_ID = crypto.randomUUID();

const PREVIEW_DATA: LinkData = {
  link: { id: 'preview-link', allow_download: true, allow_comments: true },
  project: {
    id: 'preview-project',
    title: 'Preview track',
    description: 'Local preview for testing the mobile share layout and comments placement.',
    cover_url: null,
    artist: { name: 'WAVR', avatar_url: null, slug: null },
  },
  version: {
    id: 'preview-version',
    version_number: 1,
    label: 'Preview',
    duration_ms: 210000,
    is_spatial: false,
    waveform_peaks: Array.from({ length: 140 }, (_, i) => 0.2 + Math.sin(i * 0.35) * 0.2 + Math.cos(i * 0.12) * 0.12),
  },
  audio_url: '',
};

interface LinkData {
  link: { id: string; allow_download: boolean; allow_comments: boolean };
  project: {
    id: string;
    title: string;
    description: string | null;
    cover_url: string | null;
    artist: { name: string; avatar_url: string | null; slug: string | null };
  };
  version: {
    id: string;
    version_number: number;
    label: string | null;
    duration_ms: number;
    is_spatial: boolean;
    waveform_peaks: number[] | null;
  };
  audio_url: string;
}

function fmtTime(ms: number) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
}

export function ShareLinkPlayer() {
  const { slug } = useParams<{ slug: string }>();
  const [searchParams] = useSearchParams();
  const previewMode = searchParams.get('preview') === '1';
  const [data, setData] = useState<LinkData | null>(null);
  const [status, setStatus] = useState<'loading' | 'pw' | 'ready' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState('');
  const [password, setPassword] = useState('');
  const [pwError, setPwError] = useState('');

  const viewData = previewMode ? PREVIEW_DATA : data;

  const resolve = async (pw?: string) => {
    const res = await fetch(EDGE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ANON_KEY}` },
      body: JSON.stringify({ slug, password: pw ?? undefined }),
    });
    const json = await res.json();

    if (res.status === 401 && json.error === 'password_required') {
      setStatus('pw');
      return;
    }
    if (res.status === 401) {
      setPwError('Incorrect password.');
      return;
    }
    if (!res.ok) {
      setErrorMsg(json.error ?? 'Something went wrong.');
      setStatus('error');
      return;
    }

    setData(json);
    setStatus('ready');
  };

  useEffect(() => {
    if (previewMode) {
      setStatus('ready');
      return;
    }
    resolve();
  }, [previewMode, slug]);

  const { track } = useAnalytics(
    viewData ? { versionId: viewData.version.id, shareLinkId: viewData.link.id, sessionId: SESSION_ID } : null,
  );

  const [audioState, audioControls] = useAudioEngine({
    url: viewData?.audio_url ?? null,
    durationMs: viewData?.version.duration_ms ?? 0,
    track,
  });

  if (status === 'pw') {
    return (
      <div style={gate.wrap}>
        <div style={gate.card}>
          <div style={gate.logo}>
            WAV<span style={{ color: '#c9f55e' }}>R</span>
          </div>
          <p style={gate.hint}>This link is password protected.</p>
          <input
            style={gate.input}
            type="password"
            placeholder="Enter password"
            value={password}
            autoFocus
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') resolve(password);
            }}
          />
          {pwError && <p style={gate.err}>{pwError}</p>}
          <button style={gate.btn} onClick={() => resolve(password)}>
            Unlock
          </button>
        </div>
      </div>
    );
  }

  if (status === 'loading') {
    return (
      <div className="share-player">
        <div className="share-player__phone">
          <div style={s.center}>Loading…</div>
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="share-player">
        <div className="share-player__phone">
          <div style={s.center}>{errorMsg}</div>
        </div>
      </div>
    );
  }

  if (!viewData) {
    return null;
  }

  const { project, version, link } = viewData;
  const progressPct = Math.round(
    (audioState.durationMs ? (audioState.positionMs / audioState.durationMs) : 0) * 100,
  );

  return (
    <div className="share-player">
      <div className="share-player__phone">
        <div className="share-player__hero">
          <div className="share-player__hero-top">
            <div>
              <div className="share-player__title">{project.title}</div>
              <div className="share-player__meta">
                <span>v{version.version_number}</span>
                {version.label && <span>{version.label}</span>}
                {version.is_spatial && <span className="share-player__spatial">● Spatial</span>}
              </div>
            </div>
            {link.allow_download && (
              <a href={viewData.audio_url} download className="share-player__download" title="Download">
                <i className="ti ti-download" />
              </a>
            )}
          </div>

          {project.cover_url ? (
            <div className="share-player__cover">
              <img src={project.cover_url} alt={project.title} />
            </div>
          ) : (
            <div className="share-player__cover">
              <div className="share-player__cover-fallback">{project.title.slice(0, 1).toUpperCase()}</div>
            </div>
          )}
        </div>

        <div className="share-player__wave">
          <div className="share-player__wave-top">
            <div>
              <div className="share-player__wave-label">Now playing</div>
              <div style={{ fontSize: 15, fontWeight: 700, marginTop: 6 }}>{project.title}</div>
            </div>
            <div className="share-player__time">
              {fmtTime(audioState.positionMs)} / {fmtTime(audioState.durationMs || version.duration_ms)}
            </div>
          </div>

          <Waveform
            peaks={
              version.waveform_peaks ??
              Array.from({ length: 120 }, (_, i) => 0.3 + Math.sin(i * 0.3) * 0.4 + Math.random() * 0.2)
            }
            positionMs={audioState.positionMs}
            durationMs={audioState.durationMs || version.duration_ms}
            bufferedPct={audioState.bufferedPct}
            onSeek={audioControls.seekTo}
            height={92}
          />

          {project.description && <p className="share-player__description">{project.description}</p>}
        </div>


        {/* Comments section now below analytics, full width */}
        {link.allow_comments && (
          <div className="share-player__comments share-player__comments--horizontal">
            <CommentsPanel
              versionId={version.id}
              shareLinkId={link.id}
              allowComments
              positionMs={audioState.positionMs}
              onSeek={audioControls.seekTo}
              layout="horizontal"
            />
          </div>
        )}

        <div className="share-player__footer">
          <div className="share-player__footer-inner">
            <div className="share-player__footer-meta">
              <div className="share-player__footer-title">{project.title}</div>
              <div className="share-player__footer-time">
                {fmtTime(audioState.positionMs)} / {fmtTime(audioState.durationMs || version.duration_ms)}
              </div>
              <div className="share-player__footer-progress">
                <div
                  className="share-player__footer-progress-fill"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>
            <button
              className="share-player__footer-play"
              onClick={audioControls.toggle}
              disabled={audioState.loading}
            >
              {audioState.loading ? '…' : audioState.playing ? <i className="ti ti-player-pause" /> : <i className="ti ti-player-play" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  center: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '40vh',
    color: 'rgba(232,228,220,0.4)',
  },
};

const gate: Record<string, React.CSSProperties> = {
  wrap: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#0a0a0b' },
  card: { background: 'rgba(255,255,255,0.03)', border: '0.5px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: '40px 36px', width: 320, display: 'flex', flexDirection: 'column', gap: 14 },
  logo: { fontSize: 20, fontWeight: 800, letterSpacing: '-0.04em' },
  hint: { fontSize: 13, color: 'rgba(232,228,220,0.4)' },
  input: { padding: '10px 14px', background: 'rgba(255,255,255,0.05)', border: '0.5px solid rgba(255,255,255,0.12)', borderRadius: 8, color: '#e8e4dc', fontSize: 14, outline: 'none' },
  err: { fontSize: 12, color: '#ff6b6b' },
  btn: { padding: '10px', background: '#c9f55e', border: 'none', borderRadius: 8, color: '#0a0a0b', fontSize: 14, fontWeight: 700, cursor: 'pointer' },
};
