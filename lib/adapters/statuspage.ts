/**
 * Atlassian Statuspage — `/api/v2/summary.json`. Anthropic and OpenAI both use
 * it, so one adapter covers two sources.
 */

import type { Status } from "../status";
import { EMPTY_READING, isJson, type Json, type SourceReading, type VendorIncident } from "./types";

const COMPONENT_STATUS: Record<string, Status> = {
  operational: "operational",
  degraded_performance: "degraded",
  partial_outage: "degraded",
  major_outage: "down",
  under_maintenance: "degraded",
};

/** A row we can key on. Anything without a stable id cannot own history. */
const hasStringId = (value: unknown): value is Json =>
  isJson(value) && typeof value.id === "string";

export function readStatuspage(payload: unknown): SourceReading {
  if (!payload || typeof payload !== "object") return EMPTY_READING;

  const page = payload as Record<string, unknown>;
  const components = Array.isArray(page.components) ? page.components : [];
  const incidents = Array.isArray(page.incidents) ? page.incidents : [];

  return {
    components: components
      .filter(hasStringId)
      // A row with `group: true` is a heading over other rows, not a thing that
      // can be up or down.
      .filter((c) => c.group !== true)
      .map((c) => ({
        key: String(c.id),
        name: String(c.name ?? c.id),
        // An unrecognised status is grey, not green. A vendor inventing a new
        // state must never silently read as healthy.
        status: COMPONENT_STATUS[String(c.status)] ?? ("unknown" as Status),
        // We measured how long *their status page* took to answer, which says
        // nothing about their API. Reporting it here would be a number that
        // looks meaningful and is not.
        latencyMs: null,
      })),

    incidents: incidents
      .filter(hasStringId)
      .map((i): VendorIncident => ({
        key: String(i.id),
        title: String(i.name ?? "Incident"),
        detail: typeof i.impact === "string" ? i.impact : undefined,
        startedAt: String(i.started_at ?? i.created_at ?? ""),
        endedAt: typeof i.resolved_at === "string" ? i.resolved_at : null,
        origin: "vendor",
        componentKeys: (Array.isArray(i.components) ? i.components : [])
          .map((c) => (c && typeof c === "object" ? String((c as { id?: unknown }).id ?? "") : ""))
          .filter(Boolean),
      })),
  };
}
