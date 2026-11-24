// @ats/security/shared — browser-safe security surface.
// Hidden-text stripping for CVs and documents (pure, no imports; pdf.js is
// passed in by the caller), shared by the server extractor and the browser
// one. Credential encryption, SSRF-guarded fetching and client-IP trust live
// on the server entry — the client bundle must never pull them in.
export * from "./document-hidden-text";
