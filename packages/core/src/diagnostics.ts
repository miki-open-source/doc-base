import picomatch from "picomatch";
import {
  compare,
  DIAGNOSTIC_CATALOG,
  diagnostic,
  type Diagnostic,
  type Suppression,
} from "@doc-base/schema";
export const CORE_CODES = new Set(Object.keys(DIAGNOSTIC_CATALOG));
export interface ScopedSuppression {
  value: Suppression;
  documentKey?: string;
}
export function applySuppressions(
  diagnostics: Diagnostic[],
  suppressions: ScopedSuppression[],
  knownCodes: Set<string>,
  now = new Date(),
): Diagnostic[] {
  const result = diagnostics.map((item) => ({ ...item }));
  for (const { value, documentKey } of suppressions) {
    if (!knownCodes.has(value.code)) {
      result.push(
        diagnostic("DBV902", `Unknown suppression code ${value.code}`, {
          documentKey,
        }),
      );
      continue;
    }
    if (value.expires && value.expires < now.toISOString().slice(0, 10)) {
      result.push(
        diagnostic("DBV901", `Expired suppression for ${value.code}`, {
          documentKey,
        }),
      );
      continue;
    }
    let matched = false;
    for (const item of result)
      if (
        item.code === value.code &&
        item.suppressible &&
        (!documentKey || item.documentKey === documentKey) &&
        (!value.source || item.sourceId === value.source) &&
        picomatch(value.path ?? "**")(item.file ?? "")
      ) {
        matched = true;
        item.suppressedBy = {
          scope: documentKey ? "document" : "project",
          reason: value.reason,
        };
      }
    if (!matched)
      result.push(
        diagnostic("DBV903", `Unused suppression for ${value.code}`, {
          severity: "warning",
          suppressible: true,
          documentKey,
        }),
      );
  }
  return result.sort(
    (a, b) =>
      compare(a.sourceId ?? "", b.sourceId ?? "") ||
      compare(a.file ?? "", b.file ?? "") ||
      (a.range?.start.line ?? 0) - (b.range?.start.line ?? 0) ||
      (a.range?.start.column ?? 0) - (b.range?.start.column ?? 0) ||
      compare(a.severity, b.severity) ||
      compare(a.code, b.code) ||
      compare(a.message, b.message),
  );
}
export function passes(
  diagnostics: Diagnostic[],
  threshold: "error" | "warning" | "never",
): boolean {
  return !diagnostics.some(
    (item) =>
      !item.suppressedBy &&
      ((item.severity === "error" && !item.suppressible) ||
        (threshold !== "never" &&
          (item.severity === "error" ||
            (threshold === "warning" && item.severity === "warning")))),
  );
}
export function counts(diagnostics: Diagnostic[]): {
  error: number;
  warning: number;
  info: number;
  suppressed: number;
} {
  const result = { error: 0, warning: 0, info: 0, suppressed: 0 };
  for (const item of diagnostics)
    if (item.suppressedBy) result.suppressed++;
    else result[item.severity]++;
  return result;
}
