import type { Status } from "../status";

/** A parsed JSON object. Adapters receive `unknown` and narrow with `isJson`. */
export type Json = Record<string, unknown>;

export const isJson = (value: unknown): value is Json =>
  Boolean(value) && typeof value === "object";

/** One checkable unit under a source. See docs/agents/domain.md, "component". */
export type ComponentReading = {
  /** Stable within the source. Never the display name — a rename must not orphan history. */
  key: string;
  name: string;
  status: Status;
  /** Null when the check measured nothing meaningful about this component. */
  latencyMs: number | null;
  detail?: string;
};

export type VendorIncident = {
  key: string;
  title: string;
  detail?: string;
  startedAt: string;
  endedAt: string | null;
  /** Always "vendor" here — they said it. We derive our own separately. */
  origin: "vendor";
  componentKeys: string[];
};

/**
 * A component we know exists but did not check this run. It is registered so
 * its name and first-seen date are recorded, and nothing else is written.
 *
 * This is deliberately NOT a ComponentReading. Giving it a status would mean
 * choosing between a green we did not observe and a grey that writes a sample
 * row on every check forever — the first is a lie, the second is the storage
 * blowout the rollup design exists to prevent.
 */
export type DiscoveredComponent = { key: string; name: string; variant?: string };

export type SourceReading = {
  components: ComponentReading[];
  /** Known to exist, not checked. Registered only. */
  discovered?: DiscoveredComponent[];
  incidents: VendorIncident[];
};

export const EMPTY_READING: SourceReading = { components: [], incidents: [] };
