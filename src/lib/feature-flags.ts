// ============================================================
// Feature flag value validation — flags are stored as strings
// and parsed according to `type` (boolean/string/number/json).
// ============================================================

export const FLAG_TYPES = ["boolean", "string", "number", "json"] as const;
export type FlagType = (typeof FLAG_TYPES)[number];

export type FlagValueResult =
  | { ok: true; stored: string }
  | { ok: false; error: string };

/**
 * Validate and normalize a flag value for storage.
 * - boolean: accepts true/false (boolean or string) → "true" | "false"
 * - number:  accepts a finite number or numeric string
 * - json:    must parse as JSON; stored compact
 * - string:  stored as-is
 */
export function normalizeFlagValue(type: string, value: unknown): FlagValueResult {
  switch (type) {
    case "boolean": {
      if (typeof value === "boolean") return { ok: true, stored: value ? "true" : "false" };
      if (value === "true" || value === "false") return { ok: true, stored: value };
      return { ok: false, error: 'boolean value must be "true" or "false"' };
    }
    case "number": {
      const n = typeof value === "number" ? value : Number(value);
      if (typeof value === "string" && value.trim() === "") {
        return { ok: false, error: "number value must not be empty" };
      }
      if (!isNaN(n) && isFinite(n)) return { ok: true, stored: String(n) };
      return { ok: false, error: "number value must be a valid number" };
    }
    case "json": {
      if (typeof value !== "string") {
        try {
          return { ok: true, stored: JSON.stringify(value) };
        } catch {
          return { ok: false, error: "json value is not serializable" };
        }
      }
      try {
        return { ok: true, stored: JSON.stringify(JSON.parse(value)) };
      } catch {
        return { ok: false, error: "json value must be valid JSON" };
      }
    }
    case "string":
      return { ok: true, stored: String(value) };
    default:
      return { ok: false, error: `unknown flag type: ${type}` };
  }
}

/** Parse a stored flag string back into its typed value (for API/UI previews). */
export function parseFlagValue(type: string, stored: string): unknown {
  switch (type) {
    case "boolean":
      return stored === "true";
    case "number": {
      const n = Number(stored);
      return isNaN(n) ? stored : n;
    }
    case "json":
      try {
        return JSON.parse(stored);
      } catch {
        return stored;
      }
    default:
      return stored;
  }
}
