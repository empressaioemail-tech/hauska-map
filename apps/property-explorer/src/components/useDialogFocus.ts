import { useEffect, type RefObject } from "react";

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export type DialogKeyResult = {
  close: boolean;
  nextIndex: number | null;
  preventDefault: boolean;
};

/** Pure Tab/Escape math. The hook applies this; tests violate it without jsdom. */
export function handleDialogKey(
  key: string,
  shiftKey: boolean,
  focusedIndex: number,
  count: number,
): DialogKeyResult {
  if (key === "Escape") {
    return { close: true, nextIndex: null, preventDefault: true };
  }
  if (key !== "Tab" || count === 0) {
    return { close: false, nextIndex: null, preventDefault: false };
  }
  if (shiftKey && focusedIndex <= 0) {
    return { close: false, nextIndex: count - 1, preventDefault: true };
  }
  if (!shiftKey && focusedIndex === count - 1) {
    return { close: false, nextIndex: 0, preventDefault: true };
  }
  return { close: false, nextIndex: null, preventDefault: false };
}

export function focusableIn(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (el) => el.offsetParent !== null || el === document.activeElement,
  );
}

/**
 * Focus trap, Escape dismiss, restore focus to the control that opened the
 * dialog. Kit Modal uses this; Pricing / Checkout / SignUp call it on their
 * own scrims until those surfaces share the kit shell.
 */
export function useDialogFocus(
  rootRef: RefObject<HTMLElement | null>,
  onClose: () => void,
): void {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const prev =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const list = focusableIn(root);
    list[0]?.focus();

    const onKey = (e: KeyboardEvent) => {
      const nodes = focusableIn(root);
      const focusedIndex = nodes.findIndex((el) => el === document.activeElement);
      const result = handleDialogKey(
        e.key,
        e.shiftKey,
        focusedIndex < 0 ? 0 : focusedIndex,
        nodes.length,
      );
      if (result.preventDefault) e.preventDefault();
      if (result.close) {
        onClose();
        return;
      }
      if (result.nextIndex !== null) {
        nodes[result.nextIndex]?.focus();
      }
    };
    root.addEventListener("keydown", onKey);
    return () => {
      root.removeEventListener("keydown", onKey);
      prev?.focus?.();
    };
  }, [onClose, rootRef]);
}
