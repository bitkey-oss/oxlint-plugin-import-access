type TimingKey =
  | "updateSnapshot"
  | "getProjectForFile"
  | "getSourceFile"
  | "getSymbolAtPosition"
  | "getImmediateAliasedSymbol"
  | "resolveSymbol"
  | "lookupPackageJson"
  | "getJsDocTags";

const timings: { [K in TimingKey]?: number } = {};

const isEnabled = !!process.env.IMPORT_ACCESS_TIMINGS;

export function measure<T>(key: TimingKey, fn: () => T): T {
  if (!isEnabled) {
    return fn();
  }

  const startAt = performance.now();
  const result = fn();

  timings[key] = (timings[key] ?? 0) + (performance.now() - startAt);

  return result;
}

if (isEnabled) {
  process.on("beforeExit", () => {
    console.error("oxlint-plugin-import-access timings:", timings);
  });
}
