/** a proofread's request: the rules, and the paragraphs with Harper's findings as JSON */
export type ProofreadPrompt = { system: string; request: string };

/** text is the answer's JSON, unparsed */
export type ProofreadAnswer = { ok: true; text: string } | { ok: false; error: string };

/** a request that has not answered by then has failed, and the paragraphs wait for their next turn */
export const PROOFREAD_TIMEOUT_MS = 30_000;
