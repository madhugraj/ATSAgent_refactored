import "@tanstack/react-start/server-only";

// @ats/requisitions/server — the tenant guard is pulled forward by the
// distribution move (boards ingest/publish/distribution assert
// assertRequisitionInOrg); the requisitions cores follow in the move PR.
export * from "./guards";
