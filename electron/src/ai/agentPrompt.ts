// A request to the reader's agent and its answer

export type AgentResult = { ok: true; text: string } | { ok: false; error: string; cancelled?: true };

/** a picture sent with a request, as base64 */
export type PromptImage = { mediaType: string; base64: string };

/** the rules of the task apart from the request itself; an agent with no place for rules gets both as one message */
export type AgentPrompt = { system: string; request: string; images?: PromptImage[] };
