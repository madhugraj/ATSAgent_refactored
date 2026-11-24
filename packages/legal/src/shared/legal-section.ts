// The section shape for the legal documents (terms, privacy, DPA) and the
// pages that render them. Lives here so the documents (shared) and the UI
// (apps/web LegalPage) share one definition — fixing the old lib->UI import
// (map §4 L2, findings A6).
export type LegalSection = { title: string; body: string[] };
