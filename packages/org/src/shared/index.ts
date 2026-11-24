// @ats/org/shared — browser-safe surface of the org/profile/context package.
// The pure profile rules (sections, refusal reasons, diffs) are shared with
// the Profile UI; the DB-backed cores and the credential store live under
// /server. Types only reference @ats/db/server types (erased at runtime), so
// nothing here pulls server code into the client bundle.
export * from "./org-profile";
