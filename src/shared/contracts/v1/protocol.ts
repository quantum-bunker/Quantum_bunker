// Wire protocol version for the relay contract (envelopes + WS control frames).
//
// Follows the MEMBERSHIP_VERSION pattern in src/shared/membership.ts: a single
// integer, bumped whenever the shape of what crosses the wire changes in a way
// an older peer cannot interpret. Without it a client/server mismatch surfaces
// only as a generic validation error, which is indistinguishable from a bug.
//
// This is NOT the application version. The app version (package.json) moves on
// every release; this moves only when the protocol itself does. Contract v1 is
// add-only per ADR-003 — a removal or rename means a new `v2/` directory, not a
// bump here.
export const PROTOCOL_VERSION = 1;

export function isProtocolCompatible(theirs: number | undefined): boolean {
  // An absent version means a peer from before this field existed. It speaks
  // protocol 1 by definition, so it stays compatible.
  return theirs === undefined || theirs === PROTOCOL_VERSION;
}
