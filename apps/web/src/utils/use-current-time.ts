import { useEffect, useState } from "react";

const DEFAULT_REFRESH_INTERVAL_MS = 60_000;

export function useCurrentTime(
  refreshIntervalMs = DEFAULT_REFRESH_INTERVAL_MS,
): number {
  const [currentTime, setCurrentTime] = useState(0);

  useEffect(() => {
    let active = true;

    const updateCurrentTime = (): void => {
      if (active) {
        setCurrentTime(Date.now());
      }
    };

    const initialTimer = window.setTimeout(updateCurrentTime, 0);
    const interval = window.setInterval(updateCurrentTime, refreshIntervalMs);

    return () => {
      active = false;
      window.clearTimeout(initialTimer);
      window.clearInterval(interval);
    };
  }, [refreshIntervalMs]);

  return currentTime;
}
