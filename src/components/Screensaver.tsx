/**
 * Screensaver — always-on visual layer
 * Always rendered, opacity controlled by parent (0.15 base → 1.0 takeover)
 * Never unmounts so video loop is always running
 */
import { useRef, useEffect, memo } from 'react';

interface ScreensaverProps {
  visualUrl:  string | null;
  isVideo:    boolean;
  opacity:    number;   // 0.15 → 1.0
  uiOpacity:  number;   // passed back up so player can fade its UI
}

export const Screensaver = memo(function Screensaver({
  visualUrl,
  isVideo,
  opacity,
}: ScreensaverProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef   = useRef<number>(0);
  const tRef      = useRef(0);

  // Animated gradient fallback
  useEffect(() => {
    if (visualUrl) { cancelAnimationFrame(animRef.current); return; }
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      canvas.width  = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    const draw = () => {
      const ctx = canvas.getContext('2d')!;
      const W = canvas.width; const H = canvas.height;
      tRef.current += 0.003;
      const t = tRef.current;

      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#050508';
      ctx.fillRect(0, 0, W, H);

      const cx1 = W * (0.3 + 0.25 * Math.sin(t * 0.6));
      const cy1 = H * (0.4 + 0.2  * Math.cos(t * 0.4));
      const cx2 = W * (0.7 + 0.2  * Math.sin(t * 0.35 + 1));
      const cy2 = H * (0.6 + 0.25 * Math.cos(t * 0.5  + 2));

      const g1 = ctx.createRadialGradient(cx1, cy1, 0, cx1, cy1, W * 0.65);
      g1.addColorStop(0,   'rgba(40, 80, 20, 0.6)');
      g1.addColorStop(0.5, 'rgba(20, 50, 10, 0.25)');
      g1.addColorStop(1,   'rgba(0,  0,  0, 0)');
      ctx.fillStyle = g1; ctx.fillRect(0, 0, W, H);

      const g2 = ctx.createRadialGradient(cx2, cy2, 0, cx2, cy2, W * 0.55);
      g2.addColorStop(0,   'rgba(60, 20, 80, 0.5)');
      g2.addColorStop(0.5, 'rgba(30, 10, 50, 0.25)');
      g2.addColorStop(1,   'rgba(0,  0,  0, 0)');
      ctx.fillStyle = g2; ctx.fillRect(0, 0, W, H);

      animRef.current = requestAnimationFrame(draw);
    };
    animRef.current = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(animRef.current); window.removeEventListener('resize', resize); };
  }, [visualUrl]);

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 0,
      opacity, transition: 'opacity 0.3s ease',
    }}>
      {visualUrl && isVideo && (
        <video
          src={visualUrl} autoPlay loop muted playsInline
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      )}
      {visualUrl && !isVideo && (
        <img src={visualUrl} alt=""
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      )}
      {!visualUrl && (
        <canvas ref={canvasRef}
          style={{ width: '100%', height: '100%', display: 'block' }} />
      )}
      {/* Subtle gradient so text stays legible at low opacity */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(to bottom, rgba(0,0,0,0.4) 0%, rgba(0,0,0,0.1) 50%, rgba(0,0,0,0.6) 100%)',
      }} />
    </div>
  );
});
