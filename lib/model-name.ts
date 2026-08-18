/**
 * A model id carries its snapshot: `deepseek-v4-flash-0731`. When the gateway
 * rotates to `-0815` that is the same model, and the component — with all of
 * its history — is the family. Treating each snapshot as a new component
 * empties every uptime bar on every rotation, which for this gateway is often.
 *
 * See docs/agents/domain.md, "family and variant".
 */

/** A four-digit MMDD snapshot. Requires the separator, so a bare "0731" is left alone. */
const SNAPSHOT = /-\d{4}$/;

/** Quantization is a build of the same model, not a different model. */
const QUANTIZATION = /-(fp8|fp16|bf16|awq|gptq|int4|int8|q4|q8|gguf)$/i;

export function familyOf(modelId: string): string {
  let name = modelId;

  // Suffixes can stack — `…-0731-fp8`. Strip until nothing changes, and never
  // strip a name down to nothing: an empty family would collapse every
  // pathological id into one shared history.
  for (;;) {
    const stripped = name.replace(QUANTIZATION, "").replace(SNAPSHOT, "");
    if (stripped === name || stripped === "") return name;
    name = stripped;
  }
}
