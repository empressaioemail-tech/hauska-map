// apps/property-explorer/src/lib/pe-terms-cancellation.ts
//
// A-062 item 6 — THE CHECK THAT KEEPS THE TERMS AND THE PRODUCT TOGETHER.
//
// THE DEFECT THIS EXISTS TO PREVENT, stated as it happened. `public/terms.html`
// said "You can cancel a paid plan through the Stripe billing flow in the
// product." Zero billing-portal references existed anywhere in this app. The
// Plan tab said "Not built" to the user's face while the legal page said the
// opposite. The product was honest and the terms were not, which is the
// inversion of the usual failure and the half that carries legal weight,
// because the terms are the document a customer is held to and holds us to.
//
// The two halves are written by different people at different times in
// different files, and NOTHING NOTICED when they drifted apart. That is the
// whole reason for this module: a promise in a legal page and a capability in
// a client are two independently authored derivations of one claim, and this
// is the consistency check between them.
//
// WHAT IT IS NOT. It is not a grep for the word "cancel", and it is not a
// presence check on a file. `pe-terms-cancellation.test.ts` asserts the
// IMPLICATION: if the terms claim an in-product cancellation path, then the
// portal path must be on the deep-proxy allowlist AND the client that posts to
// it must exist AND Settings must render a control for it. Each of those is
// read from the artefact that actually decides it, not from a transcription.
//
// WHERE THE OTHER HALF OF THE CHECK LIVES, declared rather than hidden. The
// Express route itself is in a different repository (legacy-design-tools,
// `routes/propertyExplorer.ts`), so no single test process can read the terms
// string and that router. The server half is pinned there by
// `src/__tests__/pe-billing-portal.test.ts`, which reads the MOUNTED app and
// asserts the path answers while its neighbours 404. This half pins everything
// the browser depends on, which is the part that was missing when the
// `ai-connections` card shipped dead: the deep proxy checks the session cookie
// BEFORE the allowlist, so an unlisted path is invisible to any probe. The
// residual seam is the path STRING, and both halves pin it as a literal.

/**
 * Plain text from an HTML document: tags removed, entities that matter
 * decoded, whitespace collapsed.
 *
 * Done because the claim is a SENTENCE and sentences in HTML are broken across
 * source lines by the formatter. Matching the raw file would make the check
 * depend on where a line wrapped, which is how a real promise slips past a
 * regex that was correct when it was written.
 */
export function termsPlainText(html: string): string {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Does this terms text promise that a customer can cancel FROM INSIDE the
 * product?
 *
 * THE SHAPE OF THE CLAIM, not one sentence's exact wording. It requires, in
 * one sentence: the verb "cancel", and a billing-or-portal word, and an
 * in-product locator ("in the product", "in the app", "in Smart Site", "in
 * your account", "in settings"). All three, because each alone is innocent —
 * "cancel" appears in a cancellation-of-service clause, "billing portal" could
 * appear in a sentence about receipts, and "in the product" appears
 * everywhere. Together they are the promise.
 *
 * DELIBERATELY NOT BROADER. A terms page that says "email us to cancel" is
 * accurate about a product with no portal and must NOT trip this, or the check
 * becomes a control wider than its claim and the next author routes around it
 * by rewording. A check that fires on prose it was never meant to reach
 * teaches people to disable it.
 */
export function termsClaimsInProductCancellation(html: string): boolean {
  const text = termsPlainText(html);
  const sentences = text.split(/(?<=[.!?])\s+/);
  const CANCEL = /\bcancel(?:s|led|ling|lation)?\b/i;
  const BILLING = /\bbilling\b|\bportal\b|\bsubscription\b|\bplan\b/i;
  const IN_PRODUCT =
    /\bin the product\b|\bin the app\b|\bin smart ?site\b|\bin your account\b|\bin settings\b|\bfrom settings\b/i;
  return sentences.some(
    (s) => CANCEL.test(s) && BILLING.test(s) && IN_PRODUCT.test(s),
  );
}
