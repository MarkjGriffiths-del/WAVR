import { useRef, useCallback, useEffect } from 'react';

const FLUSH_INTERVAL = 10000;
const EDGE_FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ingest-events`;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export type EventType = 'play' | 'pause' | 'seek' | 'skip' | 'complete' | 'buffer';

interface RawEvent {
  event_type: EventType;
  position_ms: number;
  seek_to_ms?: number;
  device_type: string;
}

interface AnalyticsConfig {
  versionId: string;
  shareLinkId?: string;
  sessionId: string;
}

export function useAnalytics(config: AnalyticsConfig | null) {
  const queue = useRef<RawEvent[]>([]);
  const flushing = useRef(false);
  const cfgRef = useRef(config);
  cfgRef.current = config;

  const flush = useCallback(async (force = false) => {
    if (!cfgRef.current || queue.current.length === 0 || flushing.current) return;
    flushing.current = true;
    const batch = queue.current.splice(0);
    try {
      await fetch(EDGE_FN_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${ANON_KEY}`,
        },
        body: JSON.stringify({
          version_id: cfgRef.current.versionId,
          share_link_id: cfgRef.current.shareLinkId ?? null,
          session_id: cfgRef.current.sessionId,
          events: batch,
        }),
        keepalive: force,
      });
    } catch {
      queue.current.unshift(...batch);
    } finally {
      flushing.current = false;
    }
  }, []);

  useEffect(() => {
    if (!config) return;
    const id = setInterval(() => flush(), FLUSH_INTERVAL);
    return () => clearInterval(id);
  }, [config, flush]);

  useEffect(() => {
    const onUnload = () => flush(true);
    window.addEventListener('pagehide', onUnload);
    return () => {
      window.removeEventListener('pagehide', onUnload);
      flush(true);
    };
  }, [flush]);

  const track = useCallback((type: EventType, positionMs: number, extra?: Partial<RawEvent>) => {
    if (!cfgRef.current) return;
    queue.current.push({
      event_type: type,
      position_ms: Math.round(positionMs),
      device_type: 'web',
      ...extra,
    });
    if (type === 'complete') flush(true);
  }, [flush]);

  return { track };
}
