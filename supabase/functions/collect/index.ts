/**
 * The collector. Runs on a schedule from pg_cron, checks every enabled source,
 * and writes the smallest amount that keeps the history honest.
 *
 * Shared logic comes from `_lib/`, generated from the repo's `lib/` by
 * `bun run sync:collector`. Do not edit `_lib/` — it is overwritten.
 */

import { createClient } from "jsr:@supabase/supabase-js@2";
import { readGcp } from "./_lib/adapters/gcp.ts";
import { readHealth, readModels, readReadiness } from "./_lib/adapters/litellm.ts";
import { readStatuspage } from "./_lib/adapters/statuspage.ts";
import type { ComponentReading, SourceReading } from "./_lib/adapters/types.ts";
import { transition, type ComponentState } from "./_lib/collector.ts";
import { addSample, emptyRollup } from "./_lib/rollup.ts";
import { classify, type CheckOutcome, type Status } from "./_lib/status.ts";

const FETCH_TIMEOUT_MS = 10_000;

type Json = Record<string, unknown>;

/**
 * Every outbound request is bounded. Without this one hanging endpoint takes
 * the whole run with it, and the sources that were answering fine get no
 * reading at all for that cycle.
 */
type FetchResult =
  | { ok: true; status: number; body: string; latencyMs: number }
  | { ok: false; timedOut: boolean; message: string; latencyMs: number };

async function timedFetch(url: string, init: RequestInit = {}): Promise<FetchResult> {
  const started = Date.now();
  const abort = AbortSignal.timeout(FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...init, signal: abort });
    const body = await response.text();
    return { ok: true as const, status: response.status, body, latencyMs: Date.now() - started };
  } catch (error) {
    const timedOut = error instanceof DOMException && error.name === "TimeoutError";
    return {
      ok: false as const,
      timedOut,
      message: error instanceof Error ? error.message : String(error),
      latencyMs: Date.now() - started,
    };
  }
}

/**
 * Every fetch result becomes a CheckOutcome so `classify` stays the only place
 * that decides what a result means. Hand-rolling it per call site had already
 * produced a disagreement: the same timeout read as `down` on one path and
 * `unknown` on another.
 */
const outcomeOf = (result: FetchResult): CheckOutcome =>
  result.ok
    ? { kind: "http", status: result.status, latencyMs: result.latencyMs }
    : result.timedOut
      ? { kind: "timeout", latencyMs: result.latencyMs }
      : { kind: "error", latencyMs: result.latencyMs, message: result.message };

const parse = (body: string): unknown => {
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
};

const DEFAULT_THRESHOLDS = { slowMs: 3_500 };
const GATEWAY_THRESHOLDS = { slowMs: 1_500 };

/** A source we could not reach. `classify` decides which kind of "no" it was. */
const unreachable = (
  components: { key: string; name: string }[],
  outcome: CheckOutcome,
  detail: string,
): SourceReading => ({
  components: components.map((c) => ({
    ...c,
    status: classify(outcome, DEFAULT_THRESHOLDS),
    latencyMs: null,
    detail,
  })),
  incidents: [],
});

async function readSource(source: { id: string; adapter: string; config: Json }): Promise<SourceReading> {
  const config = source.config;

  if (source.adapter === "statuspage" || source.adapter === "gcp") {
    const result = await timedFetch(String(config.url));
    if (!result.ok) {
      return unreachable([{ key: source.id, name: source.id }], outcomeOf(result), result.message);
    }

    const payload = parse(result.body);
    return source.adapter === "statuspage"
      ? readStatuspage(payload)
      : readGcp(payload, {
          key: String(config.componentKey),
          name: String(config.componentName),
          match: new RegExp(String(config.match), "i"),
        });
  }

  if (source.adapter === "litellm") {
    const base = String(config.baseUrl);
    const key = Deno.env.get("GATEWAY_9ARM_KEY");

    // The gateway itself needs no credential, so this reading always happens.
    const readiness = await timedFetch(`${base}${config.readinessPath}`);
    const gateway: ComponentReading = {
      key: "gateway",
      name: "API Gateway",
      // A 200 carries a body that says more than the status code does. Anything
      // else, including a failed fetch, is classify's call.
      status:
        readiness.ok && readiness.status === 200
          ? readReadiness(parse(readiness.body))
          : classify(outcomeOf(readiness), GATEWAY_THRESHOLDS),
      latencyMs: readiness.ok ? readiness.latencyMs : null,
      detail: readiness.ok ? undefined : readiness.message,
    };

    // No key means we report grey. It never means borrowing one: a fallback key
    // committed to a public repository is how the reference build leaked its own.
    // `classify` has an outcome kind for exactly this case.
    if (!key) {
      return {
        components: [
          gateway,
          {
            key: "models",
            name: "Model listing",
            status: classify({ kind: "no-credential" }, DEFAULT_THRESHOLDS),
            latencyMs: null,
            detail: "GATEWAY_9ARM_KEY is not set",
          },
        ],
        incidents: [],
      };
    }

    const auth = { headers: { "x-api-key": key, Authorization: `Bearer ${key}` } };

    // LiteLLM checks every configured model itself when the key is allowed to
    // ask. When it is not, discovery still tells us which models exist.
    const health = await timedFetch(`${base}${config.healthPath}`, auth);
    if (health.ok && health.status === 200) {
      const models = readHealth(parse(health.body));
      if (models.length > 0) return { components: [gateway, ...models], incidents: [] };
    }

    const listing = await timedFetch(`${base}${config.modelsPath}`, auth);
    if (!listing.ok) return { components: [gateway], incidents: [] };

    if (listing.status === 401 || listing.status === 403) {
      return {
        components: [
          gateway,
          {
            key: "models",
            name: "Model listing",
            status: classify(outcomeOf(listing), DEFAULT_THRESHOLDS),
            latencyMs: null,
          },
        ],
        incidents: [],
      };
    }

    return {
      components: [
        gateway,
        ...readModels(parse(listing.body)).map((m) => ({
          key: m.key,
          name: m.name,
          // It appeared in a listing. That is not the same as having answered,
          // and calling it operational would be exactly the false green this
          // project exists to avoid. Grey until something actually probes it.
          status: "unknown" as Status,
          latencyMs: null,
          detail: m.variant,
        })),
      ],
      incidents: [],
    };
  }

  return unreachable(
    [{ key: source.id, name: source.id }],
    { kind: "error", latencyMs: 0, message: "no adapter" },
    `no adapter for ${source.adapter}`,
  );
}

Deno.serve(async () => {
  const db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const { data: sources } = await db.from("sources").select("id, adapter, config").eq("enabled", true);
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const summary: Record<string, string> = {};

  // One source failing must not stop the others. allSettled, never all.
  const results = await Promise.allSettled(
    (sources ?? []).map(async (source) => ({ source, reading: await readSource(source as never) })),
  );

  for (const result of results) {
    if (result.status === "rejected") continue;
    const { source, reading } = result.value;

    for (const component of reading.components) {
      // Discovery: a model we have not seen becomes a component; one that
      // disappears is retired elsewhere, never deleted.
      const { data: existing } = await db
        .from("components")
        .select("id, name, variant")
        .eq("source_id", source.id)
        .eq("key", component.key)
        .maybeSingle();

      let componentId = existing?.id as number | undefined;
      if (!componentId) {
        const { data: created } = await db
          .from("components")
          .insert({ source_id: source.id, key: component.key, name: component.name, variant: component.detail })
          .select("id")
          .single();
        componentId = created?.id as number | undefined;
      } else {
        await db
          .from("components")
          .update({ last_seen_at: now.toISOString(), variant: component.detail ?? existing?.variant })
          .eq("id", componentId);
      }
      if (!componentId) continue;

      const { data: stateRow } = await db
        .from("component_state")
        .select("status, consecutive_ok, consecutive_bad")
        .eq("component_id", componentId)
        .maybeSingle();

      const previous: ComponentState = {
        status: (stateRow?.status as Status) ?? "unknown",
        consecutiveOk: stateRow?.consecutive_ok ?? 0,
        consecutiveBad: stateRow?.consecutive_bad ?? 0,
        openIncident: false,
      };

      const { data: openIncident } = await db
        .from("incidents")
        .select("id")
        .eq("component_id", componentId)
        .eq("origin", "derived")
        .is("ended_at", null)
        .maybeSingle();
      previous.openIncident = Boolean(openIncident);

      const step = transition(previous, {
        status: component.status,
        latencyMs: component.latencyMs,
        detail: component.detail,
      });

      await db.from("component_state").upsert({
        component_id: componentId,
        status: step.state.status,
        latency_ms: component.latencyMs,
        detail: component.detail ?? null,
        last_checked_at: now.toISOString(),
        consecutive_ok: step.state.consecutiveOk,
        consecutive_bad: step.state.consecutiveBad,
      });

      if (step.event) {
        await db.from("status_events").insert({
          component_id: componentId,
          from_status: step.event.from,
          to_status: step.event.to,
          detail: component.detail ?? null,
        });
      }

      // Green stores nothing. This is what keeps the database inside the free tier.
      if (step.storeSample) {
        await db.from("check_samples").insert({
          component_id: componentId,
          status: component.status,
          latency_ms: component.latencyMs,
          detail: component.detail ?? null,
        });
      }

      if (step.action?.kind === "open-incident") {
        await db.from("incidents").insert({
          component_id: componentId,
          origin: "derived",
          title: `${component.name} is ${component.status}`,
          detail: component.detail ?? null,
          severity: step.action.severity,
          started_at: now.toISOString(),
        });
      } else if (step.action?.kind === "close-incident" && openIncident) {
        await db.from("incidents").update({ ended_at: now.toISOString() }).eq("id", openIncident.id);
      }

      // The daily row is read, updated and written back. It is the only history
      // that survives, so every check contributes to it including green ones.
      const { data: existingRollup } = await db
        .from("daily_rollups")
        .select("*")
        .eq("component_id", componentId)
        .eq("day", today)
        .maybeSingle();

      const base = existingRollup
        ? {
            checkCount: existingRollup.check_count,
            counts: {
              operational: existingRollup.operational_count,
              degraded: existingRollup.degraded_count,
              down: existingRollup.down_count,
              unreachable: existingRollup.unreachable_count,
            },
            latencyBuckets: existingRollup.latency_buckets as Record<string, number>,
            worstStatus: existingRollup.worst_status as Status,
          }
        : emptyRollup();

      // addSample is the only code that knows how a status contributes to a day.
      const next = addSample(base, { status: component.status, latencyMs: component.latencyMs });

      await db.from("daily_rollups").upsert({
        component_id: componentId,
        day: today,
        check_count: next.checkCount,
        operational_count: next.counts.operational,
        degraded_count: next.counts.degraded,
        down_count: next.counts.down,
        unreachable_count: next.counts.unreachable,
        worst_status: next.worstStatus,
        latency_buckets: next.latencyBuckets,
      });

      summary[`${source.id}/${component.key}`] = component.status;
    }

    // Vendor incidents are recorded under their own id so re-reading the feed
    // updates the row instead of duplicating it.
    for (const incident of reading.incidents) {
      const { data: component } = await db
        .from("components")
        .select("id")
        .eq("source_id", source.id)
        .in("key", incident.componentKeys.length ? incident.componentKeys : ["__none__"])
        .limit(1)
        .maybeSingle();
      if (!component) continue;

      await db.from("incidents").upsert(
        {
          component_id: component.id,
          origin: "vendor",
          vendor_key: incident.key,
          title: incident.title,
          detail: incident.detail ?? null,
          severity: "minor",
          started_at: incident.startedAt || now.toISOString(),
          ended_at: incident.endedAt,
        },
        { onConflict: "component_id,vendor_key" },
      );
    }
  }

  return new Response(JSON.stringify({ checkedAt: now.toISOString(), summary }, null, 2), {
    headers: { "content-type": "application/json" },
  });
});
