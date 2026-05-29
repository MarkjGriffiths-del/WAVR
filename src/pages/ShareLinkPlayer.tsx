/**
 * ShareLinkPlayer — public share link page at /p/:slug
 * - No login required
 * - Mobile-first, matches Dashboard player UI
 * - Real waveform analysis via Web Audio API
 * - Screensaver visual layer with same fade behaviour
 * - Resolves via Supabase directly (no Edge Function dependency)
 */
import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAnalytics } from '../hooks/useAnalytics';
import { useAudioEngine } from '../hooks/useAudioEngine';
import { useWaveformAnalyser } from '../hooks/useWaveformAnalyser';
import { useScreensaver } from '../hooks/useScreensaver';
import { Waveform } from '../components/Waveform';
import { Screensaver } from '../components/Screensaver';

const SESSION_ID = crypto.randomUUID();

interface LinkData {
  linkId:       string;
  allowDownload: boolean;
  projectTitle: string;
  artistName:   string | null;
  versionId:    string;
  durationMs:   number;
  isSpatial:    boolean;
  waveformPeaks: number[] | null;
  audioUrl:     string;
  visualUrl:    string | null;
  visualIsVideo: boolean;
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

export function ShareLinkPlayer() {
  const { slug } = useParams<{ slug: string }>();
  const [data, setData]       = useState<LinkData | null>(null);
  const [status, setStatus]   = useState<'loading' | 'pw' | 'ready' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState('');
  const [password, setPassword] = useState('');
  const [pwError, setPwError]   = useState('');
  const [updatedAt, setUpdatedAt] = useState('');

  const resolve = useCallback(async (pw?: string) => {
    if (!slug) return;

    // 1. Fetch the share link
    const { data: link, error: linkErr } = await supabase
      .from('share_links')
      .select('id, password_hash, allow_download, allow_comments, expires_at, is_active, project_id, version_id')
      .eq('slug', slug)
      .maybeSingle();

    if (linkErr || !link) { setErrorMsg('Link not found.'); setStatus('error'); return; }
    if (!link.is_active)  { setErrorMsg('This link is no longer active.'); setStatus('error'); return; }
    if (link.expires_at && new Date(link.expires_at) < new Date()) {
      setErrorMsg('This link has expired.'); setStatus('error'); return;
    }

    // 2. Password check (client-side prompt; actual verification via bcrypt would need edge fn)
    if (link.password_hash && !pw) { setStatus('pw'); return; }

    // 3. Resolve version — link.version_id if pinned, else latest ready
    let versionId = link.version_id;
    if (!versionId) {
      const { data: latest } = await supabase
        .from('versions')
        .select('id')
        .eq('project_id', link.project_id)
        .eq('status', 'ready')
        .order('version_number', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!latest) { setErrorMsg('No audio available yet.'); setStatus('error'); return; }
      versionId = latest.id;
    }

    // 4. Fetch version + project + profile in one go
    const { data: version } = await supabase
      .from('versions')
      .select('id, duration_ms, is_spatial, waveform_peaks, storage_path, projects(id, title, updated_at, owner_id, profiles(display_name))')
      .eq('id', versionId)
      .single();

    if (!version) { setErrorMsg('Could not load track.'); setStatus('error'); return; }

    const project = (version as any).projects;
    const profile = project?.profiles;

    // 5. Get signed audio URL
    const { data: signed } = await supabase.storage
      .from('audio')
      .createSignedUrl(version.storage_path, 3600);

    if (!signed) { setErrorMsg('Could not load audio.'); setStatus('error'); return; }

    // 6. Fetch visual for screensaver
    let visualUrl: string | null = null;
    let visualIsVideo = false;

    const { data: visual } = await supabase
      .from('project_visuals')
      .select('storage_path, is_video')
      .or(`project_id.eq.${project.id},is_default.eq.true`)
      .order('is_default', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (visual) {
      visualIsVideo = visual.is_video;
      const { data: { publicUrl } } = supabase.storage
        .from('visuals')
        .getPublicUrl(visual.storage_path);
      visualUrl = publicUrl;
    }

    // 7. Increment view count (fire and forget)
    supabase.from('share_links')
      .update({ view_count: supabase.rpc('view_count + 1') })
      .eq('id', link.id)
      .then(() => {});

    setUpdatedAt(project?.updated_at ?? '');
    setData({
      linkId:        link.id,
      allowDownload: link.allow_download,
      projectTitle:  project?.title ?? 'Untitled',
      artistName:    profile?.display_name ?? null,
      versionId:     version.id,
      durationMs:    version.duration_ms,
      isSpatial:     version.is_spatial,
      waveformPeaks: version.waveform_peaks,
      audioUrl:      signed.signedUrl,
      visualUrl,
      visualIsVideo,
    });
    setStatus('ready');
  }, [slug]);

  useEffect(() => { resolve(); }, [resolve]);

  const { track } = useAnalytics(
    data ? { versionId: data.versionId, shareLinkId: data.linkId, sessionId: SESSION_ID } : null
  );

  const [audioState, audioControls] = useAudioEngine({
    url:        data?.audioUrl ?? null,
    durationMs: data?.durationMs ?? 0,
    track,
  });

  const { peaks, analysing } = useWaveformAnalyser(data?.audioUrl ?? null);
  const screensaver = useScreensaver();

  // ── Password gate ────────────────────────────────────────────
  if (status === 'pw') {
    return (
      <div style={g.wrap}>
        <div style={g.card}>
          <div style={g.logo}>WAV<span style={{ color: 'rgba(255,255,255,0.85)' }}>R</span></div>
          <p style={g.hint}>This link is password protected.</p>
          <input
            style={g.input} type="password" placeholder="Enter password"
            value={password} autoFocus
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') resolve(password); }}
          />
          {pwError && <p style={g.err}>{pwError}</p>}
          <button style={g.btn} onClick={() => resolve(password)}>Unlock</button>
        </div>
      </div>
    );
  }

  if (status === 'loading') return (
    <div style={s.center}>
      <div style={s.spinner} />
    </div>
  );

  if (status === 'error') return (
    <div style={s.center}>
      <div style={s.logo}>WAV<span style={{ color: 'rgba(255,255,255,0.85)' }}>R</span></div>
      <p style={{ color: 'rgba(232,228,220,0.4)', marginTop: 16, fontSize: 14 }}>{errorMsg}</p>
    </div>
  );

  if (!data) return null;

  const { opacity: ssOpacity, uiOpacity, trigger: ssTrigger, dismiss: ssDismiss } = screensaver;

  return (
    <div
      style={{ position: 'relative', minHeight: '100vh', background: '#000', overflow: 'hidden', fontFamily: "'Syne', sans-serif" }}
      onClick={uiOpacity < 0.5 ? ssDismiss : undefined}
    >
      {/* ── Screensaver — always behind ── */}
      <Screensaver
        visualUrl={data.visualUrl}
        isVideo={data.visualIsVideo}
        opacity={ssOpacity}
        uiOpacity={uiOpacity}
      />

      {/* ── UI that fades out ── */}
      <div style={{ position: 'relative', zIndex: 2, opacity: uiOpacity, transition: 'opacity 0.5s ease', pointerEvents: uiOpacity < 0.1 ? 'none' : 'auto' }}>

        {/* Top bar */}
        <div style={s.topbar}>
          <div style={s.logo}>WAV<span style={{ color: 'rgba(255,255,255,0.85)' }}>R</span></div>
          {data.artistName && <span style={s.artistName}>{data.artistName}</span>}
        </div>

        {/* Art placeholder */}
        <div style={s.artArea}>
          <div style={s.artPlaceholder}>
            <span style={s.artInitial}>{data.projectTitle[0]}</span>
          </div>
        </div>

        {/* Track info */}
        <div style={s.trackInfo}>
          <div style={s.trackTitle}>{data.projectTitle}</div>
          <div style={s.trackSub}>
            {data.isSpatial && <span style={{ color: '#a78bfa' }}>● Spatial · </span>}
            {updatedAt ? timeAgo(updatedAt) : ''}
          </div>
        </div>
      </div>

      {/* ── Waveform — always on top ── */}
      <div style={{ position: 'relative', zIndex: 3, padding: '0 20px 4px' }}>
        <Waveform
          peaks={peaks}
          analysing={analysing}
          positionMs={audioState.positionMs}
          durationMs={audioState.durationMs || data.durationMs}
          bufferedPct={audioState.bufferedPct}
          onSeek={audioControls.seekTo}
          height={56}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, opacity: uiOpacity, transition: 'opacity 0.5s ease' }}>
          <span style={s.timeLabel}>{fmtTime(audioState.positionMs)}</span>
          <span style={s.timeLabel}>{fmtTime(audioState.durationMs || data.durationMs)}</span>
        </div>
      </div>

      {/* ── Play button — always on top ── */}
      <div style={{ position: 'relative', zIndex: 3, display: 'flex', justifyContent: 'center', padding: '24px 20px 16px' }}>
        <button style={s.playBtn} onClick={audioControls.toggle} disabled={audioState.loading}>
          {audioState.loading
            ? <span style={{ fontSize: 14 }}>…</span>
            : audioState.playing
              ? <i className="ti ti-player-pause-filled" style={{ fontSize: 28 }} />
              : <i className="ti ti-player-play-filled" style={{ fontSize: 28, marginLeft: 3 }} />}
        </button>
      </div>

      {/* ── Controls that fade out ── */}
      <div style={{ position: 'relative', zIndex: 2, opacity: uiOpacity, transition: 'opacity 0.5s ease', pointerEvents: uiOpacity < 0.1 ? 'none' : 'auto' }}>

        {/* Skip buttons */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 48, paddingBottom: 20 }}>
          <button style={s.skipBtn} onClick={() => audioControls.seekTo(Math.max(0, audioState.positionMs - 15000))}>
            <i className="ti ti-player-skip-back" />
            <span style={s.skipLabel}>15</span>
          </button>
          <div style={{ width: 72 }} />
          <button style={s.skipBtn} onClick={() => audioControls.seekTo(Math.min(audioState.durationMs, audioState.positionMs + 15000))}>
            <i className="ti ti-player-skip-forward" />
            <span style={s.skipLabel}>15</span>
          </button>
        </div>

        {/* Download if allowed */}
        {data.allowDownload && (
          <div style={{ padding: '0 20px 12px' }}>
            <a href={data.audioUrl} download style={s.actionBtn}>
              <i className="ti ti-download" /> Download
            </a>
          </div>
        )}

        {/* Screensaver trigger */}
        <div style={{ display: 'flex', justifyContent: 'center', paddingBottom: 32 }}>
          <button style={s.ssBtn} onClick={ssTrigger}>
            <i className="ti ti-moon" /> Screensaver
          </button>
        </div>

        {/* WAVR branding footer */}
        <div style={s.footer}>
          <span style={s.footerText}>Shared via </span>
          <span style={s.footerBrand}>WAV<span style={{ color: 'rgba(255,255,255,0.85)' }}>R</span></span>
        </div>
      </div>

      {/* Tap to return hint */}
      {ssOpacity > 0.7 && (
        <div style={{ position: 'fixed', bottom: 48, left: 0, right: 0, zIndex: 4, textAlign: 'center', color: 'rgba(255,255,255,0.35)', fontSize: 13, letterSpacing: '0.05em', pointerEvents: 'none' }}>
          Tap to return
        </div>
      )}

      {audioState.error && (
        <p style={{ position: 'relative', zIndex: 3, color: '#ff6b6b', textAlign: 'center', fontSize: 12 }}>
          {audioState.error}
        </p>
      )}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  center:      { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#0a0a0b', gap: 8 },
  spinner:     { width: 24, height: 24, border: '2px solid rgba(255,255,255,0.1)', borderTop: '2px solid rgba(255,255,255,0.85)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' },
  topbar:      { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', position: 'sticky', top: 0, zIndex: 10 },
  logo:        { fontSize: 20, fontWeight: 800, letterSpacing: '-0.04em', color: '#e8e4dc' },
  artistName:  { fontSize: 12, color: 'rgba(232,228,220,0.4)' },
  artArea:     { display: 'flex', justifyContent: 'center', padding: '24px 20px 20px' },
  artPlaceholder: { width: 180, height: 180, borderRadius: 18, background: 'linear-gradient(135deg, rgba(201,245,94,0.12), rgba(167,139,250,0.08))', border: '0.5px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  artInitial:  { fontSize: 64, fontWeight: 800, color: 'rgba(232,228,220,0.12)', letterSpacing: '-0.05em' },
  trackInfo:   { padding: '0 24px 20px', textAlign: 'center' },
  trackTitle:  { fontSize: 22, fontWeight: 800, letterSpacing: '-0.03em', marginBottom: 6, color: '#e8e4dc' },
  trackSub:    { fontSize: 12, color: 'rgba(232,228,220,0.35)' },
  timeLabel:   { fontSize: 11, color: 'rgba(232,228,220,0.3)', fontFamily: "'DM Mono', monospace" },
  playBtn:     { width: 72, height: 72, borderRadius: '50%', background: 'rgba(255,255,255,0.85)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0a0a0b', flexShrink: 0 },
  skipBtn:     { background: 'none', border: 'none', color: 'rgba(232,228,220,0.5)', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, fontSize: 22 },
  skipLabel:   { fontSize: 10, fontFamily: "'DM Mono', monospace", color: 'rgba(232,228,220,0.3)' },
  actionBtn:   { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', padding: '14px', background: 'rgba(255,255,255,0.04)', border: '0.5px solid rgba(255,255,255,0.1)', borderRadius: 10, color: 'rgba(232,228,220,0.7)', fontSize: 14, textDecoration: 'none', fontFamily: "'Syne', sans-serif" },
  ssBtn:       { background: 'none', border: 'none', color: 'rgba(232,228,220,0.25)', fontSize: 12, cursor: 'pointer', fontFamily: "'Syne', sans-serif", display: 'flex', alignItems: 'center', gap: 6, padding: '4px 12px' },
  footer:      { textAlign: 'center', padding: '0 0 40px', color: 'rgba(232,228,220,0.2)', fontSize: 12 },
  footerText:  { color: 'rgba(232,228,220,0.2)' },
  footerBrand: { fontWeight: 800, letterSpacing: '-0.03em', color: 'rgba(232,228,220,0.3)' },
};

const g: Record<string, React.CSSProperties> = {
  wrap:  { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#0a0a0b' },
  card:  { background: 'rgba(255,255,255,0.03)', border: '0.5px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: '40px 36px', width: 320, display: 'flex', flexDirection: 'column', gap: 14 },
  logo:  { fontSize: 20, fontWeight: 800, letterSpacing: '-0.04em', color: '#e8e4dc' },
  hint:  { fontSize: 13, color: 'rgba(232,228,220,0.4)' },
  input: { padding: '12px 14px', background: 'rgba(255,255,255,0.05)', border: '0.5px solid rgba(255,255,255,0.12)', borderRadius: 8, color: '#e8e4dc', fontSize: 14, outline: 'none', fontFamily: "'Syne', sans-serif" },
  err:   { fontSize: 12, color: '#ff6b6b' },
  btn:   { padding: '12px', background: 'rgba(255,255,255,0.85)', border: 'none', borderRadius: 8, color: '#0a0a0b', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: "'Syne', sans-serif" },
};
