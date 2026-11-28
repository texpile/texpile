/** a proofread's request: the rules, and the paragraphs with Harper's findings as JSON */
export type ProofreadPrompt = { system: string; request: string };

/** text is the answer's JSON, unparsed */
export type ProofreadAnswer = { ok: true; text: string } | { ok: false; error: string };
