/**
 * Dashboard — mobile-first redesign
 * - Single column layout
 * - Track list view → tap to open player view
 * - No version stacking (shows latest version only)
 * - No comments
 * - Guest mode (no login required to browse)
 */
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { useAnalytics } from '../hooks/useAnalytics';
import { useAudioEngine } from '../hooks/useAudioEngine';
import { Waveform } from '../components/Waveform';
import { nanoid } from 'nanoid';

interface Project {
  id: string;
  title: string;
  updated_at: string;
  versions: Version[];
}

interface Version {
  id: string;
  version_number: number;
  label: string | null;
  duration_ms: number;
  is_spatial: boolean;
  status: string;
  waveform_peaks: number[] | null;
  storage_path: string;
  uploaded_at: string;
}

function fmtDuration(ms: number) {
  if (!ms) return '—';
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
}

function fmtTime(ms: number) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3600000);
  if (h < 1) return 'just now';
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const SESSION_ID = crypto.randomUUID();

export function Dashboard() {
  const { user, signOut } = useAuth();
  const [projects, setProjects]       = useState<Project[]>([]);
  const [loading, setLoading]         = useState(true);
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [activeVersion, setActiveVersion] = useState<Version | null>(null);
  const [audioUrl, setAudioUrl]       = useState<string | null>(null);
  const [shareSlug, setShareSlug]     = useState<string | null>(null);
  const [copied, setCopied]           = useState(false);
  const [view, setView]               = useState<'list' | 'player'>('list');
  const [menuOpen, setMenuOpen]       = useState(false);

  const { track } = useAnalytics(
    activeVersion ? { versionId: activeVersion.id, sessionId: SESSION_ID } : null
  );

  const [audioState, audioControls] = useAudioEngine({
    url:        audioUrl,
    durationMs: activeVersion?.duration_ms ?? 0,
    track,
  });

  useEffect(() => {
    supabase
      .from('projects')
      .select(`id, title, updated_at, versions(id, version_number, label, duration_ms, is_spatial, status, waveform_peaks, storage_path, uploaded_at)`)
      .order('updated_at', { ascending: false })
      .then(({ data }) => {
        if (data) {
          const sorted = (data as Project[]).map(p => ({
            ...p,
            // Only keep the latest ready version per project
            versions: p.versions
              .filter(v => v.status === 'ready')
              .sort((a, b) => b.version_number - a.version_number)
              .slice(0, 1),
          })).filter(p => p.versions.length > 0);
          setProjects(sorted);
        }
        setLoading(false);
      });
  }, []);

  const openPlayer = useCallback(async (project: Project) => {
    const version = project.versions[0];
    if (!version) return;
    setActiveProject(project);
    setActiveVersion(version);
    setAudioUrl(null);
    setView('player');

    const { data } = await supabase.storage
      .from('audio')
      .createSignedUrl(version.storage_path, 3600);
    if (data) setAudioUrl(data.signedUrl);

    const { data: link } = await supabase
      .from('share_links')
      .select('slug')
      .eq('project_id', project.id)
      .eq('is_active', true)
      .maybeSingle();
    setShareSlug(link?.slug ?? null);
  }, []);

  const createShareLink = async () => {
    if (!activeProject) return;
    const slug = nanoid(8);
    await supabase.from('share_links').insert({
      project_id:     activeProject.id,
      slug,
      allow_comments: false,
      allow_download: false,
    });
    setShareSlug(slug);
  };

  const copyLink = () => {
    navigator.clipboard.writeText(`${window.location.origin}/p/${shareSlug}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const goBack = () => {
    setView('list');
    setMenuOpen(false);
  };

  if (loading) return <div style={s.center}>Loading…</div>;

  // ── PLAYER VIEW ──────────────────────────────────────────────
  if (view === 'player' && activeProject && activeVersion) {
    const progress = audioState.durationMs
      ? (audioState.positionMs / audioState.durationMs) * 100
      : 0;

    return (
      <div style={s.page}>
        {/* Top bar */}
        <div style={s.topbar}>
          <button style={s.backBtn} onClick={goBack}>
            <i className="ti ti-chevron-left" /> Back
          </button>
          <div style={s.topbarTitle}>Now playing</div>
          <button style={s.menuBtn} onClick={() => setMenuOpen(m => !m)}>
            <i className="ti ti-dots" />
          </button>
        </div>

        {/* Dropdown menu */}
        {menuOpen && (
          <div style={s.dropdown}>
            {shareSlug ? (
              <button style={s.dropItem} onClick={() => { copyLink(); setMenuOpen(false); }}>
                {copied ? '✓ Link copied!' : '🔗 Copy share link'}
              </button>
            ) : (
              <button style={s.dropItem} onClick={() => { createShareLink(); setMenuOpen(false); }}>
                🔗 Generate share link
              </button>
            )}
            <button style={s.dropItem} onClick={() => { signOut(); }}>
              Sign out
            </button>
          </div>
        )}

        {/* Art / title area */}
        <div style={s.artArea}>
          <div style={s.artPlaceholder}>
            <span style={s.artInitial}>{activeProject.title[0]}</span>
          </div>
        </div>

        {/* Track info */}
        <div style={s.trackInfo}>
          <div style={s.trackTitle}>{activeProject.title}</div>
          <div style={s.trackSub}>
            {activeVersion.is_spatial && <span style={s.spatialDot}>● Spatial · </span>}
            Updated {timeAgo(activeProject.updated_at)}
          </div>
        </div>

        {/* Waveform */}
        <div style={s.waveWrap}>
          <Waveform
            peaks={activeVersion.waveform_peaks ?? Array(80).fill(0).map((_, i) => 0.3 + Math.sin(i * 0.4) * 0.3 + Math.random() * 0.3)}
            positionMs={audioState.positionMs}
            durationMs={audioState.durationMs || activeVersion.duration_ms}
            bufferedPct={audioState.bufferedPct}
            onSeek={audioControls.seekTo}
            height={56}
          />
          <div style={s.timeRow}>
            <span style={s.timeLabel}>{fmtTime(audioState.positionMs)}</span>
            <span style={s.timeLabel}>{fmtTime(audioState.durationMs || activeVersion.duration_ms)}</span>
          </div>
        </div>

        {/* Transport */}
        <div style={s.transport}>
          <button style={s.skipBtn} onClick={() => audioControls.seekTo(Math.max(0, audioState.positionMs - 15000))}>
            <i className="ti ti-player-skip-back" />
            <span style={s.skipLabel}>15</span>
          </button>

          <button style={s.playBtn} onClick={audioControls.toggle} disabled={audioState.loading}>
            {audioState.loading
              ? <span style={{ fontSize: 14 }}>…</span>
              : audioState.playing
                ? <i className="ti ti-player-pause-filled" style={{ fontSize: 28 }} />
                : <i className="ti ti-player-play-filled" style={{ fontSize: 28, marginLeft: 3 }} />}
          </button>

          <button style={s.skipBtn} onClick={() => audioControls.seekTo(Math.min(audioState.durationMs, audioState.positionMs + 15000))}>
            <i className="ti ti-player-skip-forward" />
            <span style={s.skipLabel}>15</span>
          </button>
        </div>

        {/* Share strip */}
        <div style={s.shareStrip}>
          {shareSlug ? (
            <button style={s.shareBtn} onClick={copyLink}>
              <i className="ti ti-link" /> {copied ? 'Link copied!' : 'Copy share link'}
            </button>
          ) : (
            <button style={s.shareBtn} onClick={createShareLink}>
              <i className="ti ti-share" /> Generate share link
            </button>
          )}
        </div>

        {audioState.error && <p style={{ color: '#ff6b6b', textAlign: 'center', fontSize: 12 }}>{audioState.error}</p>}
      </div>
    );
  }

  // ── LIST VIEW ────────────────────────────────────────────────
  return (
    <div style={s.page}>
      {/* Top bar */}
      <div style={s.topbar}>
        <div style={s.logo}>WAV<span style={{ color: '#c9f55e' }}>R</span></div>
        <div style={s.topbarRight}>
          <span style={s.userEmail}>{user?.email?.split('@')[0]}</span>
          <button style={s.signOutBtn} onClick={signOut}>Sign out</button>
        </div>
      </div>

      {/* Now playing mini bar — shows when something is loaded */}
      {activeProject && audioState.durationMs > 0 && (
        <div style={s.miniBar} onClick={() => setView('player')}>
          <div style={s.miniBarLeft}>
            <div style={s.miniDot} />
            <span style={s.miniTitle}>{activeProject.title}</span>
          </div>
          <div style={s.miniControls}>
            <span style={s.miniTime}>{fmtTime(audioState.positionMs)}</span>
            <button style={s.miniPlay} onClick={e => { e.stopPropagation(); audioControls.toggle(); }}>
              {audioState.playing
                ? <i className="ti ti-player-pause-filled" />
                : <i className="ti ti-player-play-filled" />}
            </button>
          </div>
        </div>
      )}

      {/* Track list */}
      <div style={s.list}>
        <div style={s.listLabel}>Your tracks</div>
        {projects.length === 0 && (
          <div style={s.empty}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🎵</div>
            <div>Drop a file into ~/Music/WAVR/ to get started</div>
          </div>
        )}
        {projects.map(p => {
          const v = p.versions[0];
          const isActive = activeProject?.id === p.id;
          return (
            <div
              key={p.id}
              style={{ ...s.trackRow, ...(isActive ? s.trackRowActive : {}) }}
              onClick={() => openPlayer(p)}
            >
              <div style={{ ...s.trackAvatar, background: isActive ? 'rgba(201,245,94,0.15)' : 'rgba(255,255,255,0.05)' }}>
                {isActive && audioState.playing
                  ? <i className="ti ti-player-pause-filled" style={{ color: '#c9f55e', fontSize: 18 }} />
                  : <i className="ti ti-player-play-filled" style={{ color: isActive ? '#c9f55e' : 'rgba(232,228,220,0.3)', fontSize: 18, marginLeft: 2 }} />}
              </div>
              <div style={s.trackRowInfo}>
                <div style={{ ...s.trackRowTitle, color: isActive ? '#e8e4dc' : 'rgba(232,228,220,0.75)' }}>{p.title}</div>
                <div style={s.trackRowMeta}>
                  {v?.is_spatial && <span style={s.spatialTag}>Spatial</span>}
                  <span>{timeAgo(p.updated_at)}</span>
                </div>
              </div>
              <div style={s.trackRowDur}>{fmtDuration(v?.duration_ms)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page:         { display: 'flex', flexDirection: 'column', minHeight: '100vh', background: '#0a0a0b', fontFamily: "'Syne', sans-serif", maxWidth: 600, margin: '0 auto' },
  center:       { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'rgba(232,228,220,0.3)' },

  // Top bar
  topbar:       { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '0.5px solid rgba(255,255,255,0.07)', position: 'sticky', top: 0, background: '#0a0a0b', zIndex: 10 },
  logo:         { fontSize: 20, fontWeight: 800, letterSpacing: '-0.04em' },
  topbarRight:  { display: 'flex', alignItems: 'center', gap: 12 },
  userEmail:    { fontSize: 12, color: 'rgba(232,228,220,0.3)' },
  signOutBtn:   { background: 'none', border: '0.5px solid rgba(255,255,255,0.12)', borderRadius: 6, color: 'rgba(232,228,220,0.4)', fontSize: 12, padding: '5px 10px', cursor: 'pointer', fontFamily: "'Syne',sans-serif" },
  backBtn:      { display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', color: 'rgba(232,228,220,0.5)', fontSize: 14, cursor: 'pointer', fontFamily: "'Syne',sans-serif', padding: 0" },
  topbarTitle:  { fontSize: 13, color: 'rgba(232,228,220,0.4)', fontWeight: 600 },
  menuBtn:      { background: 'none', border: 'none', color: 'rgba(232,228,220,0.5)', fontSize: 20, cursor: 'pointer', padding: '0 4px' },

  // Dropdown
  dropdown:     { position: 'absolute', top: 60, right: 16, background: '#1a1a1b', border: '0.5px solid rgba(255,255,255,0.1)', borderRadius: 10, zIndex: 100, overflow: 'hidden', minWidth: 200 },
  dropItem:     { display: 'block', width: '100%', padding: '14px 18px', background: 'none', border: 'none', color: 'rgba(232,228,220,0.8)', fontSize: 14, textAlign: 'left', cursor: 'pointer', fontFamily: "'Syne',sans-serif', borderBottom: '0.5px solid rgba(255,255,255,0.06)'" },

  // Mini now-playing bar
  miniBar:      { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', background: 'rgba(201,245,94,0.06)', borderBottom: '0.5px solid rgba(201,245,94,0.15)', cursor: 'pointer' },
  miniBarLeft:  { display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 },
  miniDot:      { width: 8, height: 8, borderRadius: '50%', background: '#c9f55e', flexShrink: 0, animation: 'pulse 2s ease-in-out infinite' },
  miniTitle:    { fontSize: 13, fontWeight: 700, color: '#e8e4dc', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  miniControls: { display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 },
  miniTime:     { fontSize: 12, color: 'rgba(232,228,220,0.4)', fontFamily: "'DM Mono', monospace" },
  miniPlay:     { background: 'none', border: 'none', color: '#c9f55e', fontSize: 20, cursor: 'pointer', display: 'flex', alignItems: 'center' },

  // Track list
  list:         { flex: 1, padding: '8px 0 100px' },
  listLabel:    { fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', color: 'rgba(232,228,220,0.25)', padding: '16px 20px 8px', textTransform: 'uppercase' },
  empty:        { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 20px', color: 'rgba(232,228,220,0.3)', fontSize: 14, textAlign: 'center' },
  trackRow:     { display: 'flex', alignItems: 'center', gap: 14, padding: '12px 20px', cursor: 'pointer', borderBottom: '0.5px solid rgba(255,255,255,0.04)', transition: 'background 0.1s' },
  trackRowActive: { background: 'rgba(201,245,94,0.04)' },
  trackAvatar:  { width: 44, height: 44, borderRadius: 10, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  trackRowInfo: { flex: 1, minWidth: 0 },
  trackRowTitle: { fontSize: 14, fontWeight: 700, marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  trackRowMeta: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'rgba(232,228,220,0.35)' },
  trackRowDur:  { fontSize: 12, color: 'rgba(232,228,220,0.3)', fontFamily: "'DM Mono', monospace", flexShrink: 0 },
  spatialTag:   { background: 'rgba(167,139,250,0.1)', color: '#a78bfa', border: '0.5px solid rgba(167,139,250,0.25)', borderRadius: 3, padding: '1px 6px', fontSize: 10 },

  // Player view
  artArea:      { display: 'flex', justifyContent: 'center', padding: '32px 20px 24px' },
  artPlaceholder: { width: 200, height: 200, borderRadius: 20, background: 'linear-gradient(135deg, rgba(201,245,94,0.15), rgba(167,139,250,0.1))', border: '0.5px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  artInitial:   { fontSize: 72, fontWeight: 800, color: 'rgba(232,228,220,0.15)', letterSpacing: '-0.05em' },
  trackInfo:    { padding: '0 24px 20px', textAlign: 'center' },
  trackTitle:   { fontSize: 22, fontWeight: 800, letterSpacing: '-0.03em', marginBottom: 6 },
  trackSub:     { fontSize: 12, color: 'rgba(232,228,220,0.35)' },
  spatialDot:   { color: '#a78bfa' },

  // Waveform
  waveWrap:     { padding: '0 20px 4px' },
  timeRow:      { display: 'flex', justifyContent: 'space-between', marginTop: 6 },
  timeLabel:    { fontSize: 11, color: 'rgba(232,228,220,0.3)', fontFamily: "'DM Mono', monospace" },

  // Transport
  transport:    { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 32, padding: '24px 20px 16px' },
  playBtn:      { width: 72, height: 72, borderRadius: '50%', background: '#c9f55e', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0a0a0b', flexShrink: 0 },
  skipBtn:      { background: 'none', border: 'none', color: 'rgba(232,228,220,0.5)', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, fontSize: 22 },
  skipLabel:    { fontSize: 10, fontFamily: "'DM Mono', monospace", color: 'rgba(232,228,220,0.3)' },

  // Share
  shareStrip:   { padding: '8px 20px 32px' },
  shareBtn:     { width: '100%', padding: '14px', background: 'rgba(255,255,255,0.04)', border: '0.5px solid rgba(255,255,255,0.1)', borderRadius: 10, color: 'rgba(232,228,220,0.7)', fontSize: 14, cursor: 'pointer', fontFamily: "'Syne',sans-serif", display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 },
};
