import { buildBars, effectiveStatus, type Bar, type DisplayStatus } from "./view";
import { createReadClient } from "./supabase";
import type { Status } from "./status";

/** How long a component may go unchecked before the page calls it stale. */
export const MAX_GAP_MS = 5 * 60 * 1000;

export type ComponentView = {
  id: number;
  sourceName: string;
  name: string;
  variant: string | null;
  status: DisplayStatus;
  latencyMs: number | null;
  uptimePct: number | null;
  bars: Bar[];
};

export type IncidentView = {
  id: number;
  componentName: string;
  title: string;
  origin: string;
  severity: string;
  startedAt: string;
  endedAt: string | null;
};

export type Board = {
  components: ComponentView[];
  incidents: IncidentView[];
};

type ComponentRow = {
  id: number;
  key: string;
  name: string;
  variant: string | null;
  retired_at: string | null;
  sources: { name: string } | null;
  component_state: { status: Status; latency_ms: number | null; last_checked_at: string } | null;
};

export async function loadBoard(days: number, now = new Date()): Promise<Board> {
  const db = createReadClient();

  const since = new Date(now);
  since.setUTCDate(since.getUTCDate() - (days - 1));
  const sinceDay = since.toISOString().slice(0, 10);

  const [components, rollups, incidents] = await Promise.all([
    db
      .from("components")
      .select("id, key, name, variant, retired_at, sources(name), component_state(status, latency_ms, last_checked_at)")
      .is("retired_at", null)
      .order("id"),
    db.from("daily_rollups").select("component_id, day, worst_status, check_count").gte("day", sinceDay),
    db
      .from("incidents")
      .select("id, title, origin, severity, started_at, ended_at, components(name)")
      .order("started_at", { ascending: false })
      .limit(20),
  ]);

  const rollupsByComponent = new Map<number, { day: string; worstStatus: Status; checkCount: number; uptimePct: null }[]>();
  for (const r of rollups.data ?? []) {
    const list = rollupsByComponent.get(r.component_id) ?? [];
    list.push({ day: r.day, worstStatus: r.worst_status, checkCount: r.check_count, uptimePct: null });
    rollupsByComponent.set(r.component_id, list);
  }

  return {
    components: ((components.data ?? []) as unknown as ComponentRow[]).map((c) => {
      const state = c.component_state;
      return {
        id: c.id,
        sourceName: c.sources?.name ?? "",
        name: c.name,
        variant: c.variant,
        status: state
          ? effectiveStatus({ status: state.status, lastCheckedAt: state.last_checked_at }, now, MAX_GAP_MS)
          : "stale",
        latencyMs: state?.latency_ms ?? null,
        uptimePct: null,
        bars: buildBars(rollupsByComponent.get(c.id) ?? [], days, now),
      };
    }),
    incidents: ((incidents.data ?? []) as unknown as Array<Record<string, unknown>>).map((i) => ({
      id: Number(i.id),
      componentName: String((i.components as { name?: string } | null)?.name ?? ""),
      title: String(i.title),
      origin: String(i.origin),
      severity: String(i.severity),
      startedAt: String(i.started_at),
      endedAt: (i.ended_at as string | null) ?? null,
    })),
  };
}
