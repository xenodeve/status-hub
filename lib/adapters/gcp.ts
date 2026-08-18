/**
 * Google publishes no Statuspage for AI Studio — `aistudio.google.com/status`
 * is a JavaScript app with no JSON behind it. `status.cloud.google.com/
 * incidents.json` is the machine-readable feed, and it covers Vertex Gemini API.
 *
 * The feed is a flat list of incidents across every Google Cloud product, so
 * the adapter is told which products this component cares about.
 */

import { worst } from "../rollup";
import type { Status } from "../status";
import type { SourceReading, VendorIncident } from "./types";

export type GcpTarget = {
  key: string;
  name: string;
  /** Matched against each incident's affected product titles. */
  match: RegExp;
};

const IMPACT: Record<string, Status> = {
  SERVICE_OUTAGE: "down",
  SERVICE_DISRUPTION: "degraded",
  // A notice, not an outage — a deprecation warning must not paint the bar red.
  SERVICE_INFORMATION: "operational",
};

type Json = Record<string, unknown>;
const isJson = (v: unknown): v is Json => Boolean(v) && typeof v === "object";

export function readGcp(payload: unknown, target: GcpTarget): SourceReading {
  // A component with no reading still renders — as grey. Returning no component
  // would draw as "no data", which is a different claim.
  if (!Array.isArray(payload)) {
    return {
      components: [{ key: target.key, name: target.name, status: "unknown", latencyMs: null }],
      incidents: [],
    };
  }

  const mine = payload.filter((incident) => {
    if (!isJson(incident)) return false;
    const products = Array.isArray(incident.affected_products) ? incident.affected_products : [];
    return products.some((p) => isJson(p) && target.match.test(String(p.title ?? "")));
  }) as Json[];

  const open = mine.filter((i) => !i.end);

  const status = open.reduce<Status>(
    (acc, i) => worst(acc, IMPACT[String(i.status_impact)] ?? "unknown"),
    "operational",
  );

  return {
    components: [{ key: target.key, name: target.name, status, latencyMs: null }],
    incidents: mine.map((i): VendorIncident => ({
      key: String(i.id ?? ""),
      title: String(i.external_desc ?? "Incident"),
      detail: typeof i.status_impact === "string" ? i.status_impact : undefined,
      startedAt: String(i.begin ?? ""),
      endedAt: typeof i.end === "string" ? i.end : null,
      origin: "vendor",
      componentKeys: [target.key],
    })),
  };
}
