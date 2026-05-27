/**
 * useWaveformAnalyser
 * Decodes an audio URL using the Web Audio API and extracts
 * real amplitude peaks — same data Pro Tools uses for its waveform display.
 *
 * Returns:
 *   peaks    — normalised 0–1 amplitude array, one value per bar
 *   analysing — true while decoding (show a loading shimmer)
 *   error    — any decode error
 */
import { useState, useEffect, useRef } from 'react';

const PEAK_COUNT = 150; // number of bars to render
const CACHE = new Map<string, number[]>(); // cache per session so we don't re-decode

export function useWaveformAnalyser(audioUrl: string | null) {
  const [peaks,     setPeaks]     = useState<number[]>([]);
  const [analysing, setAnalysing] = useState(false);
  const [error,     setError]     = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!audioUrl) { setPeaks([]); return; }

    // Return cached result immediately
    if (CACHE.has(audioUrl)) {
      setPeaks(CACHE.get(audioUrl)!);
      return;
    }

    // Cancel any in-flight analysis
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setAnalysing(true);
    setError(null);
    setPeaks([]);

    (async () => {
      try {
        // 1. Fetch the audio file
        const response = await fetch(audioUrl, { signal: controller.signal });
        if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);
        const arrayBuffer = await response.arrayBuffer();
        if (controller.signal.aborted) return;

        // 2. Decode with Web Audio API (works offline, no server needed)
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
        await audioCtx.close();
        if (controller.signal.aborted) return;

        // 3. Mix down to mono by averaging all channels
        const numChannels = audioBuffer.numberOfChannels;
        const length      = audioBuffer.length;
        const mono        = new Float32Array(length);

        for (let c = 0; c < numChannels; c++) {
          const channelData = audioBuffer.getChannelData(c);
          for (let i = 0; i < length; i++) {
            mono[i] += channelData[i] / numChannels;
          }
        }

        // 4. Extract RMS (root mean square) per bucket — more accurate than peak
        //    RMS reflects perceived loudness, which is what Pro Tools shows
        const bucketSize = Math.floor(length / PEAK_COUNT);
        const raw: number[] = [];

        for (let b = 0; b < PEAK_COUNT; b++) {
          const start = b * bucketSize;
          const end   = Math.min(start + bucketSize, length);
          let sumSq   = 0;
          let count   = 0;

          for (let i = start; i < end; i++) {
            sumSq += mono[i] * mono[i];
            count++;
          }

          raw.push(count > 0 ? Math.sqrt(sumSq / count) : 0);
        }

        // 5. Normalise so the loudest bucket = 1.0
        const max = Math.max(...raw, 0.0001);
        const normalised = raw.map(v => Math.min(1, v / max));

        // Cache and set
        CACHE.set(audioUrl, normalised);
        if (!controller.signal.aborted) {
          setPeaks(normalised);
          setAnalysing(false);
        }
      } catch (err: any) {
        if (err.name === 'AbortError') return;
        console.error('[useWaveformAnalyser]', err);
        setError(err.message);
        setAnalysing(false);
      }
    })();

    return () => { controller.abort(); };
  }, [audioUrl]);

  return { peaks, analysing, error };
}
