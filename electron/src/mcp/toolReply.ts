// The three shapes a tool reply takes, shared by every tool module
type ToolReply = { isError?: boolean; content: { type: 'text'; text: string }[] };

export function ok(data: unknown): ToolReply {
	return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

/** the one refusal shape, whether the renderer refused or the request never reached it */
export function fail(message: string): ToolReply {
	return { isError: true, content: [{ type: 'text', text: JSON.stringify({ ok: false, reason: message }) }] };
}

/** a refusal that carries more than a message, e.g. the candidate lines of an ambiguous quote */
export function refused(data: unknown): ToolReply {
	return { isError: true, content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}
