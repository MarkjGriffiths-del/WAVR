/**
 * Waveform — real audio peaks, mobile HiDPI, Pro Tools style
 */
import { useRef, useEffect, useCallback, memo } from 'react';

interface WaveformProps {
  peaks:       number[];
  analysing?:  boolean;
  positionMs:  number;
  durationMs:  number;
  bufferedPct: number;
  onSeek:      (ms: number) => void;
  accentColor?: string;
  height?:      number;
}

export const Waveform = memo(function Waveform({
  peaks,
  analysing = false,
  positionMs,
  durationMs,
  bufferedPct,
  onSeek,
  accentColor = '#c9f55e',
  height = 64,
}: WaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragging  = useRef(false);
  const cssW      = useRef(0);
  const animRef   = useRef<number>(0);
  const shimmerX  = useRef(0);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;
    const W   = cssW.current;
    const H   = height;
    const ctx = canvas.getContext('2d')!;

    ctx.clearRect(0, 0, W * dpr, H * dpr);
    ctx.save();
    ctx.scale(dpr, dpr);

    // ── Shimmer loading state ─────────────────────────────────
    if (analysing || peaks.length === 0) {
      // Draw muted placeholder bars
      const barCount = 60;
      const barW     = Math.max(2, (W / barCount) * 0.6);
      const gap      = (W / barCount) - barW;
      const midY     = H / 2;

      for (let i = 0; i < barCount; i++) {
        const x    = i * (barW + gap) + gap / 2;
        const amp  = 0.2 + 0.15 * Math.sin(i * 0.5);
        const barH = Math.max(3, amp * (H - 8));
        ctx.fillStyle   = '#ffffff';
        ctx.globalAlpha = 0.06;
        ctx.beginPath();
        ctx.roundRect(x, midY - barH / 2, barW, barH, barW / 2);
        ctx.fill();
      }

      // Shimmer sweep
      if (analysing) {
        const shimW  = W * 0.3;
        const grad   = ctx.createLinearGradient(shimmerX.current - shimW / 2, 0, shimmerX.current + shimW / 2, 0);
        grad.addColorStop(0,    'rgba(255,255,255,0)');
        grad.addColorStop(0.5,  'rgba(255,255,255,0.06)');
        grad.addColorStop(1,    'rgba(255,255,255,0)');
        ctx.fillStyle   = grad;
        ctx.globalAlpha = 1;
        ctx.fillRect(0, 0, W, H);
      }

      ctx.restore();
      return;
    }

    // ── Real peaks ────────────────────────────────────────────
    const playPct  = durationMs > 0 ? Math.min(1, positionMs / durationMs) : 0;
    const buffFrac = Math.min(1, bufferedPct / 100);
    const barW     = Math.max(2, (W / peaks.length) * 0.65);
    const gap      = (W / peaks.length) - barW;
    const midY     = H / 2;
    const radius   = barW / 2;

    peaks.forEach((amp, i) => {
      const x      = i * (barW + gap) + gap / 2;
      const barH   = Math.max(3, amp * (H - 6));
      const top    = midY - barH / 2;
      const barPct = (x + barW / 2) / W;

      if (barPct <= playPct) {
        ctx.fillStyle   = accentColor;
        ctx.globalAlpha = 0.95;
      } else if (barPct <= buffFrac) {
        ctx.fillStyle   = accentColor;
        ctx.globalAlpha = 0.2;
      } else {
        ctx.fillStyle   = '#ffffff';
        ctx.globalAlpha = 0.15;
      }

      ctx.beginPath();
      ctx.roundRect(x, top, barW, barH, radius);
      ctx.fill();
    });

    ctx.globalAlpha = 1;

    // Playhead
    const px = playPct * W;
    ctx.beginPath();
    ctx.strokeStyle = accentColor;
    ctx.lineWidth   = 2;
    ctx.shadowColor = accentColor;
    ctx.shadowBlur  = 10;
    ctx.moveTo(px, 2);
    ctx.lineTo(px, H - 2);
    ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.restore();
  }, [peaks, analysing, positionMs, durationMs, bufferedPct, accentColor, height]);

  // Shimmer animation loop
  useEffect(() => {
    if (!analysing) { cancelAnimationFrame(animRef.current); return; }

    const W = cssW.current;
    const animate = () => {
      shimmerX.current = (shimmerX.current + W * 0.012) % (W * 1.3);
      draw();
      animRef.current = requestAnimationFrame(animate);
    };
    animRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animRef.current);
  }, [analysing, draw]);

  // ResizeObserver
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(entries => {
      const { width } = entries[0].contentRect;
      const dpr = window.devicePixelRatio || 1;
      cssW.current  = width;
      canvas.width  = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width  = `${width}px`;
      canvas.style.height = `${height}px`;
      draw();
    });
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [draw, height]);

  useEffect(() => { draw(); }, [draw]);

  const pctFrom = (e: React.MouseEvent | React.TouchEvent) => {
    const rect    = canvasRef.current!.getBoundingClientRect();
    const clientX = 'touches' in e
      ? (e.touches[0] ?? e.changedTouches[0]).clientX
      : e.clientX;
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  };

  const seek = (e: React.MouseEvent | React.TouchEvent) => {
    onSeek(pctFrom(e) * durationMs);
  };

  return (
    <canvas
      ref={canvasRef}
      style={{ width: '100%', height, display: 'block', cursor: 'pointer', borderRadius: 8, touchAction: 'none' }}
      onMouseDown={e  => { dragging.current = true;  seek(e); }}
      onMouseMove={e  => { if (dragging.current) seek(e); }}
      onMouseUp={()   => { dragging.current = false; }}
      onMouseLeave={() => { dragging.current = false; }}
      onTouchStart={e => { dragging.current = true;  seek(e); }}
      onTouchMove={e  => { if (dragging.current) seek(e); }}
      onTouchEnd={()  => { dragging.current = false; }}
      role="slider"
      aria-label="Seek"
      aria-valuemin={0}
      aria-valuemax={durationMs}
      aria-valuenow={positionMs}
    />
  );
});
