import { useCallback, useEffect, useRef, useState } from "react";
import { DESKTOP_RUNTIME, readCodexUsageNative } from "../lib/desktop";

const REFRESH_INTERVAL_MS = 60_000;

export function useCodexUsage() {
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const requestId = useRef(0);

  const refresh = useCallback(async ({ quiet = false } = {}) => {
    const currentRequest = ++requestId.current;
    if (!quiet) setRefreshing(true);

    try {
      let nextPayload;
      if (DESKTOP_RUNTIME) {
        nextPayload = await readCodexUsageNative();
      } else {
        const response = await fetch(`/api/codex-usage?t=${Date.now()}`, { cache: "no-store" });
        nextPayload = await response.json();
        if (!response.ok) throw new Error(nextPayload.detail || nextPayload.error || "读取失败");
      }

      if (currentRequest !== requestId.current) return;
      setPayload(nextPayload);
      setError("");
    } catch (refreshError) {
      if (currentRequest !== requestId.current) return;
      setError(refreshError?.message || String(refreshError || "暂时无法读取 Codex 账户数据"));
    } finally {
      if (currentRequest === requestId.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    refresh();
    const interval = window.setInterval(() => refresh({ quiet: true }), REFRESH_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [refresh]);

  return { payload, loading, refreshing, error, refresh };
}
