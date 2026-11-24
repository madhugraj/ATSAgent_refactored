// @ats/desk-core/shared — browser-safe surface of the hiring-desk store package.
// Intentionally empty for now: every conversation-store function reads or
// writes the hiring_conversations / hiring_messages tables, so it is
// server-side only (@ats/desk-core/server). A shared surface (e.g. thread
// view types for UI components) arrives in a later slice.
export {};
