// Whether the toolbar's ONE Reports dot should be lit.
//
// Two independent, honestly-derived counts feed it: records-request jobs
// that finished cleanly (useRecordsUnread) and filed reports the reader has
// not opened (useReportsUnread). Both already resolve to zero on anything
// they cannot confirm — signed out, an error, an unreachable network — so
// zero here always means "nothing we know of", never "we could not check".
//
// This function only ever returns a boolean. The rail's rule is "one dot,
// never a count" (Workbench.tsx) — callers must not sum these two numbers
// and must not surface either one anywhere the dot itself renders.
export function shouldLightReportsDot(
  recordsUnread: number,
  reportsUnread: number,
): boolean {
  return recordsUnread > 0 || reportsUnread > 0;
}
