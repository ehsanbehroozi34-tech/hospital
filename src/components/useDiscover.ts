"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./ui";

export type DiscoverInfo = {
  running: boolean;
  specialty: "OTA" | "ATA" | null;
  startedAt: number | null;
  finishedAt: number | null;
  logs: string[];
  added: number;
  pages: number;
  error: string | null;
};

export function useDiscover(onDone?: (s: DiscoverInfo) => void) {
  const [state, setState] = useState<DiscoverInfo | null>(null);
  const wasRunning = useRef(false);
  const cb = useRef(onDone);
  cb.current = onDone;

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const s = await api<DiscoverInfo>("/api/discover");
        if (!alive) return;
        setState(s);
        if (wasRunning.current && !s.running) {
          wasRunning.current = false;
          cb.current?.(s);
        }
        if (s.running) wasRunning.current = true;
      } catch {
        /* ignore */
      }
    };
    tick();
    const t = setInterval(tick, 2500);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const start = useCallback(async (specialty: "OTA" | "ATA") => {
    wasRunning.current = true;
    const r = await api<{ started: boolean; state: DiscoverInfo }>("/api/discover", { method: "POST", json: { specialty } });
    setState(r.state);
    return r.started;
  }, []);

  /** Mark that a discovery was already started elsewhere (e.g. by /api/batch) */
  const watch = useCallback(() => {
    wasRunning.current = true;
  }, []);

  return { state, start, watch };
}
