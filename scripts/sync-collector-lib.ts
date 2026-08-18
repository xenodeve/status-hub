/**
 * Copies the shared logic in `lib/` into the collector function as `_lib/`.
 *
 * The web app and the collector must agree exactly on what a status means and
 * when an incident opens — two copies of that would drift, and the drift would
 * show up as a page disagreeing with its own database. So there is one source,
 * `lib/`, and this makes the Deno-shaped copy the Edge Function needs.
 *
 * The only transformation is adding `.ts` to relative imports: Deno requires
 * the extension and the Next bundler does not.
 */

import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const FROM = "lib";
const TO = "supabase/functions/collect/_lib";

/** Everything the collector needs, and nothing that pulls in React or Next. */
const INCLUDE = [
  "status.ts",
  "model-name.ts",
  "rollup.ts",
  "collector.ts",
  "adapters/types.ts",
  "adapters/statuspage.ts",
  "adapters/litellm.ts",
  "adapters/gcp.ts",
];

const addExtensions = (source: string) =>
  source.replace(/(from\s+")(\.\.?\/[^"]+?)(")/g, (match, open, path, close) =>
    path.endsWith(".ts") ? match : `${open}${path}.ts${close}`,
  );

await rm(TO, { recursive: true, force: true });

for (const file of INCLUDE) {
  const source = await readFile(join(FROM, file), "utf8");
  const target = join(TO, file);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, addExtensions(source), "utf8");
}

const stray = (await readdir(FROM)).filter((f) => f.endsWith(".test.ts"));
console.log(`synced ${INCLUDE.length} files to ${TO} (skipped ${stray.length} test files)`);
