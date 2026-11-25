/**
 * Browser helper: trigger a download of an .ics invite built by
 * `buildIcs` (@ats/comms/shared — map §11 ruling 3: the pure builder lives in
 * the package, the Blob/document download stays a UI helper here).
 */

/** Trigger a browser download of the invite. */
export function downloadIcs(filename: string, ics: string) {
  const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".ics") ? filename : `${filename}.ics`;
  a.click();
  URL.revokeObjectURL(url);
}
