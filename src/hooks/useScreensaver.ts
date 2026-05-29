/**
 * useScreensaver
 *
 * Two modes:
 * 1. IDLE mode   — auto-fades after IDLE_START_MS, any touch dismisses
 * 2. LOCKED mode — triggered manually, ignores all touches, only dismiss() exits
 *
 * Returns: opacity, uiOpacity, trigger, dismiss
 */
import { useState, useEffect, useRef, useCallback } from 'react';

const IDLE_START_MS    = 30_000;  // 30s idle before auto-fade
const FADE_DURATION_MS = 12_000;  // 12s auto-fade duration
const FAST_FADE_MS     = 500;     // 0.5s manual trigger fade
const BASE_OPACITY     = 0.15;    // always-on background level

export function useScreensaver() {
  const [opacity, setOpacity]     = useState(BASE_OPACITY);
  const [uiOpacity, setUiOpacity] = useState(1);

  const idleTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fadeTimer  = useRef<ReturnType<typeof setInterval> | null>(null);
  const fadeStart  = useRef<number>(0);
  const opacityRef = useRef(BASE_OPACITY);
  const lockedRef  = useRef(false); // true when manually triggered — ignores touches

  const stopFade = useCallback(() => {
    if (fadeTimer.current) { clearInterval(fadeTimer.current); fadeTimer.current = null; }
  }, []);

  const startFade = useCallback((duration: number) => {
    fadeStart.current = Date.now();
    stopFade();
    fadeTimer.current = setInterval(() => {
      const elapsed    = Date.now() - fadeStart.current;
      const progress   = Math.min(1, elapsed / duration);
      const newOpacity = BASE_OPACITY + (1 - BASE_OPACITY) * progress;
      const uiFade     = Math.max(0, 1 - progress * 1.6);
      opacityRef.current = newOpacity;
      setOpacity(newOpacity);
      setUiOpacity(uiFade);
      if (progress >= 1) stopFade();
    }, 16);
  }, [stopFade]);

  // Dismiss — always works regardless of mode
  const dismiss = useCallback(() => {
    lockedRef.current = false;
    stopFade();
    opacityRef.current = BASE_OPACITY;
    setOpacity(BASE_OPACITY);
    setUiOpacity(1);
    // Restart idle timer after dismiss
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => startFade(FADE_DURATION_MS), IDLE_START_MS);
  }, [stopFade, startFade]);

  // Manual trigger — locks screensaver, ignores all other touches
  const trigger = useCallback(() => {
    lockedRef.current = true;
    if (idleTimer.current) clearTimeout(idleTimer.current);
    startFade(FAST_FADE_MS);
  }, [startFade]);

  // Idle touch handler — only fires in IDLE mode (not locked)
  const resetIdle = useCallback(() => {
    if (lockedRef.current) return; // locked — ignore all touches
    if (opacityRef.current > BASE_OPACITY + 0.02) {
      // Auto-fade was in progress — dismiss it
      stopFade();
      opacityRef.current = BASE_OPACITY;
      setOpacity(BASE_OPACITY);
      setUiOpacity(1);
    }
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => startFade(FADE_DURATION_MS), IDLE_START_MS);
  }, [stopFade, startFade]);

  useEffect(() => {
    const events = ['touchstart', 'mousedown', 'keydown'];
    events.forEach(e => window.addEventListener(e, resetIdle, { passive: true }));
    idleTimer.current = setTimeout(() => startFade(FADE_DURATION_MS), IDLE_START_MS);
    return () => {
      events.forEach(e => window.removeEventListener(e, resetIdle));
      if (idleTimer.current) clearTimeout(idleTimer.current);
      stopFade();
    };
  }, [resetIdle, startFade, stopFade]);

  return { opacity, uiOpacity, trigger, dismiss };
}
