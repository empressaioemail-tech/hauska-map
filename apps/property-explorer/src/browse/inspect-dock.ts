/**
 * Whether inspectInPlace should steal the right-rail dock to Brief.
 *
 * Map click and Find steal (keepDock unset). My properties / Compare
 * reopen and share-landing flight fly the parcel but must leave the
 * current dock (W3.1, W5.2, shared-analysis).
 * A check observed only passing is not a check: keepDock true must NOT steal.
 */
export function inspectStealsWorkbenchDock(keepDock: boolean | undefined): boolean {
  return keepDock !== true;
}
