"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createReadClient } from "@/lib/supabase";

/**
 * Re-renders the page when the collector writes. Subscribing to Postgres
 * changes and asking the server component to run again keeps one copy of the
 * rendering logic — the alternative is a second, client-side renderer that
 * drifts from the first.
 *
 * Supabase Free allows 200 concurrent realtime connections. When the socket
 * cannot be established we fall back to polling rather than showing a page
 * that silently stops updating.
 */
export function LiveRefresh({ pollMs = 30_000 }: { pollMs?: number }) {
  const router = useRouter();
  const [live, setLive] = useState(false);

  useEffect(() => {
    const db = createReadClient();
    const channel = db
      .channel("status-hub")
      .on("postgres_changes", { event: "*", schema: "public", table: "component_state" }, () =>
        router.refresh(),
      )
      .subscribe((status) => setLive(status === "SUBSCRIBED"));

    return () => {
      void db.removeChannel(channel);
    };
  }, [router]);

  useEffect(() => {
    if (live) return;
    const id = setInterval(() => router.refresh(), pollMs);
    return () => clearInterval(id);
  }, [live, pollMs, router]);

  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs text-neutral-500"
      title={live ? "Updating live" : "Live connection unavailable — polling instead"}
    >
      <span
        className={`size-1.5 rounded-full ${live ? "bg-emerald-500" : "bg-neutral-600"}`}
        aria-hidden
      />
      {live ? "live" : "polling"}
    </span>
  );
}
