/**
 * useScreensaver — always-on visual layer
 *
 * - Visual always visible at BASE_OPACITY (15%)
 * - After IDLE_START_MS of no touch → fades up to 1.0 over FADE_DURATION_MS
 * - Any touch → snaps back to BASE_OPACITY instantly
 * - Manual trigger() → starts fade immediately
 * - Returns opacity (0.15 → 1.0) and uiOpacity (1.0 → 0.0, inverse)
 */
import { useState, useEffect, useRef, useCallback } from 'react';

const IDLE_START_MS    = 10_000;   // 10s idle before takeover starts
const FADE_DURATION_MS = 12_000;   // 12s to go from base → full
const BASE_OPACITY     = 0.15;     // always-on background opacity

export function useScreensaver() {
  const [opacity, setOpacity]   = useState(BASE_OPACITY);
  const [uiOpacity, setUiOpacity] = useState(1);
  const idleTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fadeTimer  = useRef<ReturnType<typeof setInterval> | null>(null);
  const fadeStart  = useRef<number>(0);
  const opacityRef = useRef(BASE_OPACITY);

  const stopFade = useCallback(() => {
    if (fadeTimer.current) { clearInterval(fadeTimer.current); fadeTimer.current = null; }
  }, []);

  // Snap back to base — called on any touch
  const dismiss = useCallback(() => {
    stopFade();
    opacityRef.current = BASE_OPACITY;
    setOpacity(BASE_OPACITY);
    setUiOpacity(1);
    // Restart idle timer
    if (idleTimer.current) clearTimeout(idleTimer.current);
  }, [stopFade]);

  const startFade = useCallback(() => {
    fadeStart.current = Date.now();
    stopFade();
    fadeTimer.current = setInterval(() => {
      const elapsed    = Date.now() - fadeStart.current;
      const progress   = Math.min(1, elapsed / FADE_DURATION_MS);
      // Visual: BASE_OPACITY → 1.0
      const newOpacity = BASE_OPACITY + (1 - BASE_OPACITY) * progress;
      // UI elements: 1.0 → 0.0 (start fading after visual hits ~40%)
      const uiFade     = Math.max(0, 1 - (progress * 1.6));
      opacityRef.current = newOpacity;
      setOpacity(newOpacity);
      setUiOpacity(uiFade);
      if (progress >= 1) stopFade();
    }, 50);
  }, [stopFade]);

  const resetIdle = useCallback(() => {
    // Any touch while fading → dismiss back to base
    if (opacityRef.current > BASE_OPACITY + 0.02) {
      dismiss();
      return;
    }
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(startFade, IDLE_START_MS);
  }, [dismiss, startFade]);

  const trigger = useCallback(() => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    startFade();
  }, [startFade]);

  useEffect(() => {
    const events = ['touchstart', 'mousedown', 'keydown'];
    events.forEach(e => window.addEventListener(e, resetIdle, { passive: true }));
    idleTimer.current = setTimeout(startFade, IDLE_START_MS);
    return () => {
      events.forEach(e => window.removeEventListener(e, resetIdle));
      if (idleTimer.current) clearTimeout(idleTimer.current);
      stopFade();
    };
  }, [resetIdle, startFade, stopFade]);

  return { opacity, uiOpacity, trigger, dismiss };
}
