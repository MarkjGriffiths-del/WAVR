/**
 * Waveform
 * Canvas-based waveform visualiser.
 * - Renders normalised peaks array as mirrored bars
 * - Shows played (accent) vs unplayed (muted) regions
 * - Overlays buffered region as a slightly lighter muted fill
 * - Draws skip/pause markers from listen_events analytics
 * - Click or drag to seek
 */
import { useRef, useEffect, useCallback, memo } from 'react';

interface SkipMarker {
  positionPct: number;  // 0–1
  type: 'skip' | 'pause';
}

interface WaveformProps {
  peaks:        number[];           // normalised 0–1 amplitude values
  positionMs:   number;
  durationMs:   number;
  bufferedPct:  number;            // 0–100
  skipMarkers?: SkipMarker[];
  onSeek:       (ms: number) => void;
  accentColor?:  string;
  height?:       number;
}

export const Waveform = memo(function Waveform({
  peaks,
  positionMs,
  durationMs,
  bufferedPct,
  skipMarkers = [],
  onSeek,
  accentColor = '#c9f55e',
  height = 72,
}: WaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragging  = useRef(false);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || peaks.length === 0) return;
    const ctx    = canvas.getContext('2d')!;
    const W      = canvas.width;
    const H      = canvas.height;
    const playPct = durationMs > 0 ? positionMs / durationMs : 0;

    ctx.clearRect(0, 0, W, H);

    const barW    = Math.max(1, Math.floor((W / peaks.length) * 0.7));
    const gap     = Math.max(1, Math.floor((W / peaks.length) * 0.3));
    const midY    = H / 2;

    peaks.forEach((amp, i) => {
      const x       = i * (barW + gap);
      const barH    = Math.max(2, amp * (H - 8));
      const barPct  = (x + barW / 2) / W;
      const buffPct = bufferedPct / 100;

      // Colour: played = accent, buffered unplayed = dimmer, unbuffered = dimmest
      if (barPct <= playPct) {
        ctx.fillStyle = accentColor;
        ctx.globalAlpha = 0.9;
      } else if (barPct <= buffPct) {
        ctx.fillStyle = accentColor;
        ctx.globalAlpha = 0.2;
      } else {
        ctx.fillStyle = '#ffffff';
        ctx.globalAlpha = 0.1;
      }

      // Mirror bars top + bottom
      ctx.fillRect(x, midY - barH / 2, barW, barH / 2);
      ctx.fillRect(x, midY, barW, barH / 2);
    });

    ctx.globalAlpha = 1;

    // Playhead line
    const px = playPct * W;
    ctx.beginPath();
    ctx.strokeStyle = accentColor;
    ctx.lineWidth   = 1.5;
    ctx.shadowColor = accentColor;
    ctx.shadowBlur  = 4;
    ctx.moveTo(px, 0);
    ctx.lineTo(px, H);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Skip / pause markers
    skipMarkers.forEach(m => {
      const mx = m.positionPct * W;
      ctx.beginPath();
      ctx.arc(mx, 8, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = m.type === 'skip' ? '#ff6b6b' : '#ffd93d';
      ctx.fill();
    });
  }, [peaks, positionMs, durationMs, bufferedPct, skipMarkers, accentColor]);

  // Resize observer keeps canvas pixel-perfect
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(entries => {
      const entry = entries[0];
      canvas.width  = entry.contentRect.width * window.devicePixelRatio;
      canvas.height = height * window.devicePixelRatio;
      canvas.style.width  = `${entry.contentRect.width}px`;
      canvas.style.height = `${height}px`;
      const ctx = canvas.getContext('2d')!;
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
      draw();
    });
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [draw, height]);

  useEffect(() => { draw(); }, [draw]);

  const pctFromEvent = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current!;
    const rect   = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  };

  const handleSeek = (e: React.MouseEvent | React.TouchEvent) => {
    const pct = pctFromEvent(e);
    onSeek(pct * durationMs);
  };

  return (
    <canvas
      ref={canvasRef}
      style={{ width: '100%', height, display: 'block', cursor: 'pointer', borderRadius: 6 }}
      onMouseDown={e => { dragging.current = true; handleSeek(e); }}
      onMouseMove={e => { if (dragging.current) handleSeek(e); }}
      onMouseUp={() => { dragging.current = false; }}
      onMouseLeave={() => { dragging.current = false; }}
      onTouchStart={e => { dragging.current = true; handleSeek(e); }}
      onTouchMove={e => { if (dragging.current) handleSeek(e); }}
      onTouchEnd={() => { dragging.current = false; }}
      aria-label="Audio waveform — click or drag to seek"
      role="slider"
      aria-valuemin={0}
      aria-valuemax={durationMs}
      aria-valuenow={positionMs}
    />
  );
});
