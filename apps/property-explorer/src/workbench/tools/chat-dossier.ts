// WB6 — SAVE CHAT TO PROPERTY: store the current thread (capped) into the
// saved property's dossier and generate an AI summary via ONE extra call to
// the SAME research/chat route the thread used. The summary is ALWAYS an AI
// artifact — the UI labels it "AI summary · saved <date>" and keeps the
// standing disclaimer with it; it is never presented as verified fact. A
// failed summary saves the thread WITHOUT a summary, honestly noted.

import {
  runChatTurn,
  type ChatSubjectContext,
  type ChatTurn,
  type ChatTurnOutcome,
} from "./chat-research";
import {
  updatePropertyDossier,
  type DossierUpdateOutcome,
} from "../../lib/savedPropertiesClient";
import {
  DOSSIER_CHAT_MAX_TURNS,
  DOSSIER_CHAT_TURN_MAX_CHARS,
  DOSSIER_SUMMARY_MAX_CHARS,
  type DossierChatSummary,
  type DossierChatTurn,
} from "../../lib/propertyDossier";

/** The ONE summary prompt (rides the same research/chat route + subject). */
export function chatSummaryPrompt(address: string | null): string {
  return `Summarize the key findings of this conversation about ${
    address ?? "this property"
  } in 5 bullet points; keep citations.`;
}

/** Thread turns capped for the dossier: last N turns, role + content only. */
export function capThreadForDossier(
  turns: Array<{ role: "user" | "assistant"; content: string }>,
): DossierChatTurn[] {
  return turns.slice(-DOSSIER_CHAT_MAX_TURNS).map((t) => ({
    role: t.role,
    content:
      t.content.length > DOSSIER_CHAT_TURN_MAX_CHARS
        ? t.content.slice(0, DOSSIER_CHAT_TURN_MAX_CHARS)
        : t.content,
  }));
}

export type SaveChatOutcome =
  /** Thread stored; `summarized` says whether the AI summary landed too.
   *  `summaryNote` carries the honest reason when it did not. */
  | { kind: "saved"; summarized: boolean; summaryNote: string | null }
  | { kind: "not-saved" }
  | { kind: "sign-in" }
  | { kind: "error"; message: string }
  | { kind: "unreachable" };

/** Honest copy for a summary attempt that did not produce an answer. */
function summaryFailureNote(outcome: ChatTurnOutcome): string {
  switch (outcome.kind) {
    case "sign-in":
      return "summary needs sign-in";
    case "paywall":
      return "summary requires a property unlock or Pro";
    case "scope-failed":
      return "summary could not scope to this property";
    case "unreachable":
      return "research service unreachable";
    default:
      return "summary generation failed";
  }
}

/**
 * Save the chat thread (capped) into the property's dossier, generating the
 * AI summary first via one extra research/chat call. Summary failure never
 * blocks the thread save. The property must already be saved (`not-saved`
 * otherwise — the caller offers to save the property first).
 */
export async function saveChatToProperty(
  input: {
    parcelNodeId: string;
    address: string | null;
    turns: Array<{ role: "user" | "assistant"; content: string }>;
    subject: ChatSubjectContext;
  },
  deps: {
    runTurn?: typeof runChatTurn;
    update?: (
      parcelNodeId: string,
      patch: Parameters<typeof updatePropertyDossier>[1],
    ) => Promise<DossierUpdateOutcome>;
    now?: () => string;
  } = {},
): Promise<SaveChatOutcome> {
  const runTurn = deps.runTurn ?? runChatTurn;
  const update = deps.update ?? updatePropertyDossier;
  const now = deps.now ?? (() => new Date().toISOString());

  if (input.turns.length === 0) {
    return { kind: "error", message: "Nothing to save — the thread is empty." };
  }

  // ONE extra call on the SAME route/subject: the summary. The full history
  // rides as `history` (runChatTurn windows to the backend's last-8 itself).
  const history: ChatTurn[] = input.turns.map((t) => ({
    role: t.role,
    content: t.content,
  }));
  let summary: DossierChatSummary | null = null;
  let summaryNote: string | null = null;
  // R1 entitlement classification: the summary rides as PAID chat — the body
  // declares purpose:"summary" so the server never counts it as (or lets it
  // slip past) the free-message allowance.
  const summaryOutcome = await runTurn({
    message: chatSummaryPrompt(input.address),
    history,
    subject: input.subject,
    purpose: "summary",
  });
  if (summaryOutcome.kind === "answer") {
    summary = {
      summary:
        summaryOutcome.answer.message.length > DOSSIER_SUMMARY_MAX_CHARS
          ? summaryOutcome.answer.message.slice(0, DOSSIER_SUMMARY_MAX_CHARS)
          : summaryOutcome.answer.message,
      savedAt: now(),
      turnCount: input.turns.length,
      disclaimer: summaryOutcome.answer.disclaimer,
    };
  } else {
    summaryNote = summaryFailureNote(summaryOutcome);
  }

  // Store thread (+ summary when it landed; an older stored summary survives
  // a failed regeneration — the patch simply omits the field).
  const outcome = await update(input.parcelNodeId, {
    chatThread: capThreadForDossier(input.turns),
    ...(summary ? { chatSummary: summary } : {}),
  });

  if (outcome.kind === "ok") {
    return { kind: "saved", summarized: summary !== null, summaryNote };
  }
  return outcome;
}
