"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createReadClient } from "@/lib/supabase";

/** One collector run writes every component in a burst; wait for it to finish. */
const COALESCE_MS = 3_000;

/**
 * Re-renders the page when the collector writes. Subscribing to Postgres
 * changes and asking the server component to run again keeps one copy of the
 * rendering logic — the alternative is a second, client-side renderer that
 * drifts from the first.
 *
 * The events arrive one per component, so a single run produced one full
 * server render per component per open tab. They are coalesced into one
 * refresh on a trailing timer: the burst completes in seconds either way, so
 * nothing is perceptibly less fresh.
 *
 * Supabase Free allows 200 concurrent realtime connections. When the socket
 * cannot be established we poll instead of showing a page that has silently
 * stopped updating.
 */
export function LiveRefresh({ pollMs = 30_000 }: { pollMs?: number }) {
  const router = useRouter();
  const [live, setLive] = useState(false);
  const pending = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    const db = createReadClient();
    const channel = db
      .channel("status-hub")
      .on("postgres_changes", { event: "*", schema: "public", table: "component_state" }, () => {
        clearTimeout(pending.current);
        pending.current = setTimeout(() => router.refresh(), COALESCE_MS);
      })
      .subscribe((status) => setLive(status === "SUBSCRIBED"));

    return () => {
      clearTimeout(pending.current);
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
