import { useState, useRef, useCallback, useEffect } from 'react';
import { EventType } from './useAnalytics';

interface AudioEngineOptions {
  url:        string | null;
  durationMs: number;
  track:      (type: EventType, posMs: number, extra?: Record<string, unknown>) => void;
  onEnded?:   () => void;   // ← called when track finishes naturally
}

interface AudioEngineState {
  playing:     boolean;
  positionMs:  number;
  durationMs:  number;
  bufferedPct: number;
  loading:     boolean;
  error:       string | null;
}

interface AudioEngineControls {
  play:   () => void;
  pause:  () => void;
  seekTo: (ms: number) => void;
  toggle: () => void;
}

export function useAudioEngine(opts: AudioEngineOptions): [AudioEngineState, AudioEngineControls] {
  const { url, durationMs, track, onEnded } = opts;

  const audioRef     = useRef<HTMLAudioElement | null>(null);
  const prevPosRef   = useRef(0);
  const rafRef       = useRef<number>(0);
  const skipGuardRef = useRef(false);
  const onEndedRef   = useRef(onEnded);
  onEndedRef.current = onEnded; // always up to date without re-wiring listeners

  const [state, setState] = useState<AudioEngineState>({
    playing: false, positionMs: 0, durationMs,
    bufferedPct: 0, loading: true, error: null,
  });

  const tick = useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    const posMs = el.currentTime * 1000;

    if (!skipGuardRef.current && posMs - prevPosRef.current > 3000) {
      track('skip', prevPosRef.current, { seek_to_ms: posMs });
    }
    prevPosRef.current = posMs;

    let bufferedPct = 0;
    if (el.buffered.length > 0 && el.duration) {
      bufferedPct = (el.buffered.end(el.buffered.length - 1) / el.duration) * 100;
    }

    setState(s => ({ ...s, positionMs: posMs, bufferedPct }));
    skipGuardRef.current = false;
    if (!el.paused) rafRef.current = requestAnimationFrame(tick);
  }, [track]);

  useEffect(() => {
    if (!url) return;

    const el = new Audio(url);
    el.preload = 'auto';
    el.crossOrigin = 'anonymous';
    audioRef.current = el;

    setState(s => ({ ...s, loading: true, error: null, positionMs: 0, playing: false }));
    prevPosRef.current = 0;

    const onCanPlay = () => setState(s => ({ ...s, loading: false, durationMs: el.duration * 1000 }));
    const onPlay    = () => {
      setState(s => ({ ...s, playing: true }));
      rafRef.current = requestAnimationFrame(tick);
      track('play', el.currentTime * 1000);
    };
    const onPause   = () => {
      setState(s => ({ ...s, playing: false }));
      cancelAnimationFrame(rafRef.current);
      track('pause', el.currentTime * 1000);
    };
    const onEndedFn = () => {
      setState(s => ({ ...s, playing: false, positionMs: s.durationMs }));
      track('complete', el.duration * 1000);
      // Fire the callback — use ref so it's always fresh
      onEndedRef.current?.();
    };
    const onError   = () => setState(s => ({ ...s, loading: false, error: 'Failed to load audio.' }));
    const onWaiting = () => { setState(s => ({ ...s, loading: true })); track('buffer', el.currentTime * 1000); };
    const onPlaying = () => setState(s => ({ ...s, loading: false }));

    el.addEventListener('canplay',  onCanPlay);
    el.addEventListener('play',     onPlay);
    el.addEventListener('pause',    onPause);
    el.addEventListener('ended',    onEndedFn);
    el.addEventListener('error',    onError);
    el.addEventListener('waiting',  onWaiting);
    el.addEventListener('playing',  onPlaying);

    return () => {
      el.pause(); el.src = '';
      cancelAnimationFrame(rafRef.current);
      el.removeEventListener('canplay',  onCanPlay);
      el.removeEventListener('play',     onPlay);
      el.removeEventListener('pause',    onPause);
      el.removeEventListener('ended',    onEndedFn);
      el.removeEventListener('error',    onError);
      el.removeEventListener('waiting',  onWaiting);
      el.removeEventListener('playing',  onPlaying);
    };
  }, [url, tick, track]);

  const play   = useCallback(() => audioRef.current?.play(), []);
  const pause  = useCallback(() => audioRef.current?.pause(), []);
  const toggle = useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    el.paused ? el.play() : el.pause();
  }, []);
  const seekTo = useCallback((ms: number) => {
    const el = audioRef.current;
    if (!el) return;
    const prevMs = el.currentTime * 1000;
    skipGuardRef.current = true;
    el.currentTime = ms / 1000;
    track('seek', prevMs, { seek_to_ms: ms });
    setState(s => ({ ...s, positionMs: ms }));
  }, [track]);

  return [state, { play, pause, seekTo, toggle }];
}
