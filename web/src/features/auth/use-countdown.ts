"use client";

import { useCallback, useEffect, useState } from "react";

/** Seconds left until a target (epoch ms). Ticks every second; 0 when unset or passed. */
export function useCountdown(initialTarget: number | null = null) {
  const [target, setTarget] = useState<number | null>(initialTarget);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (target === null || target <= Date.now()) return;
    const id = setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= target) clearInterval(id);
    }, 1000);
    return () => clearInterval(id);
  }, [target]);

  const seconds = target === null ? 0 : Math.max(0, Math.ceil((target - now) / 1000));
  const startAt = useCallback((epochMs: number) => {
    setNow(Date.now());
    setTarget(epochMs);
  }, []);
  const startFor = useCallback((secs: number) => startAt(Date.now() + secs * 1000), [startAt]);
  return { seconds, startAt, startFor };
}
