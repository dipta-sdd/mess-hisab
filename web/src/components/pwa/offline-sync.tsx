"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useMessInfo } from "@/features/expenses/api";
import { useMess } from "@/lib/mess/mess-context";
import { syncQueued } from "@/lib/offline/sync";

/** Sends queued expenses when the app opens or the connection returns. */
export function OfflineSync() {
  const { messId } = useMess();
  const client = useQueryClient();
  const meId = useMessInfo(messId).data?.me.id;

  useEffect(() => {
    if (meId === undefined) return;
    const run = () => {
      if (navigator.onLine) void syncQueued(client, messId, meId);
    };
    run();
    window.addEventListener("online", run);
    return () => window.removeEventListener("online", run);
  }, [client, messId, meId]);

  return null;
}
