/**
 * Whether inspectInPlace should steal the right-rail dock to Brief.
 *
 * Map click and Find steal (keepDock unset). My properties / Compare
 * reopen flies the parcel but must leave the current dock (W3.1, W5.2).
 * A check observed only passing is not a check: keepDock true must NOT steal.
 */
export function inspectStealsWorkbenchDock(keepDock: boolean | undefined): boolean {
  return keepDock !== true;
}
