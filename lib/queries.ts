import { uptimePct } from "./rollup";
import { totalCounts } from "./totals";
import { createReadClient } from "./supabase";
import type { Status } from "./status";
import { buildBars, dayRange, effectiveStatus, type Bar, type DisplayStatus, type RollupRow } from "./view";

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
  name: string;
  variant: string | null;
  sources: { name: string } | null;
  component_state: { status: Status; latency_ms: number | null; last_checked_at: string } | null;
};

type RollupDbRow = {
  component_id: number;
  day: string;
  worst_status: Status;
  operational_count: number;
  degraded_count: number;
  down_count: number;
};

type IncidentDbRow = {
  id: number;
  title: string;
  origin: string;
  severity: string;
  started_at: string;
  ended_at: string | null;
  components: { name: string } | null;
};

export async function loadBoard(days: number, now = new Date()): Promise<Board> {
  const db = createReadClient();
  const keys = dayRange(days, now);
  const sinceDay = keys[0]!;

  // Components first: their ids scope the rollup query, so a retired component's
  // permanent history is never transferred just to be discarded.
  const { data: componentData } = await db
    .from("components")
    .select("id, name, variant, sources(name), component_state(status, latency_ms, last_checked_at)")
    .is("retired_at", null)
    .order("id");

  const components = (componentData ?? []) as unknown as ComponentRow[];
  const ids = components.map((c) => c.id);

  const [rollups, incidents] = await Promise.all([
    ids.length
      ? db
          .from("daily_rollups")
          .select("component_id, day, worst_status, operational_count, degraded_count, down_count")
          .in("component_id", ids)
          .gte("day", sinceDay)
      : Promise.resolve({ data: [] as RollupDbRow[] }),
    db
      .from("incidents")
      .select("id, title, origin, severity, started_at, ended_at, components(name)")
      .order("started_at", { ascending: false })
      .limit(20),
  ]);

  const byComponent = new Map<number, RollupDbRow[]>();
  for (const row of (rollups.data ?? []) as unknown as RollupDbRow[]) {
    const list = byComponent.get(row.component_id);
    if (list) list.push(row);
    else byComponent.set(row.component_id, [row]);
  }

  return {
    components: components.map((c) => {
      const state = c.component_state;
      const rows = byComponent.get(c.id) ?? [];

      const history: RollupRow[] = rows.map((r) => ({ day: r.day, worstStatus: r.worst_status }));

      return {
        id: c.id,
        sourceName: c.sources?.name ?? "",
        name: c.name,
        variant: c.variant,
        status: state
          ? effectiveStatus({ status: state.status, lastCheckedAt: state.last_checked_at }, now, MAX_GAP_MS)
          : "stale",
        latencyMs: state?.latency_ms ?? null,
        // Over the whole visible range, from the counters the collector
        // accumulated — the arithmetic the rollup module defines.
        uptimePct: uptimePct(totalCounts(rows)),
        bars: buildBars(history, days, now, keys),
      };
    }),
    incidents: ((incidents.data ?? []) as unknown as IncidentDbRow[]).map((i) => ({
      id: i.id,
      componentName: i.components?.name ?? "",
      title: i.title,
      origin: i.origin,
      severity: i.severity,
      startedAt: i.started_at,
      endedAt: i.ended_at,
    })),
  };
}
