// Saved-chat display cleaner (W3.5). Strips markdown emphasis, em/en dashes,
// and a trailing "next steps" dump. Does not invent replacement copy.
// Applied at RENDER time — stored turns stay as saved.

const NEXT_STEPS_TAIL =
  /(?:^|\n)[ \t]*(?:#{1,6}[ \t]+|\*{0,2}[ \t]*)next[ \t]+steps\b[\s\S]*$/i;

export function cleanChatDisplay(text: string): string {
  let out = text.replace(NEXT_STEPS_TAIL, "");
  out = out.replace(/\*\*([^*]+)\*\*/g, "$1");
  out = out.replace(/__([^_]+)__/g, "$1");
  out = out.replace(/\*([^*]+)\*/g, "$1");
  out = out.replace(/_([^_]+)_/g, "$1");
  out = out.replace(/\*+/g, "");
  out = out.replace(/\u2014/g, ", ");
  out = out.replace(/\u2013/g, ", ");
  out = out.replace(/\s+,/g, ",");
  out = out.replace(/,[ \t]{2,}/g, ", ");
  out = out.replace(/[ \t]+\n/g, "\n");
  out = out.replace(/\n{3,}/g, "\n\n");
  return out.trim();
}

/** Accordion law: at most one thread id is open. Null = all collapsed. */
export function nextOpenChatThread(
  current: string | null,
  clicked: string,
): string | null {
  return current === clicked ? null : clicked;
}
