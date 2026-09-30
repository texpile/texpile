/* eslint no-param-reassign: "off" -- normalizes the LSP response in place: the object is ours to rewrite before forwarding */
// Reclassify "snippets" that contain no fields as plain text, so the caret survives accepting one.
//
// A semantics collision, measured from both ends. tinymist marks 71 of the 232 items at a bare
// '#' as snippet-format even though their text has no tab stop ("alignment", "black", ...) -
// legitimate under VS Code's rules, where a snippet without a final $0 gets an IMPLICIT cursor
// at its end. CodeMirror's snippet() has no implicit stop: with no fields it sets no selection
// at all, and the caret is simply mapped through the change - which lands it at the END when the
// completion replaced typed text, but leaves it BEFORE the insertion when the edit range was
// empty. Hence the bug's precise shape: accepting "alignment" from the bare-'#' popup parks the
// caret right after '#', while the same item accepted after typing '#al' is fine, and items with
// a real field ("align(${1:})") are always fine.
//
// Plain-text items take the other apply path, which sets the selection explicitly - so the fix
// is to call these what they are.

/** a tab stop or placeholder ($1, ${1:...}), or a snippet escape the plain path would not undo */
const SNIPPET_SYNTAX = /\$\{|\$\d|\\[$}\\]/;

type CompletionItemish = {
	insertTextFormat?: number;
	insertText?: string;
	label?: string;
	textEdit?: { newText?: string };
};

function normalizeItem(item: CompletionItemish): void {
	if (item.insertTextFormat !== 2) return;
	const text = item.textEdit?.newText ?? item.insertText ?? item.label ?? '';
	if (!SNIPPET_SYNTAX.test(text)) item.insertTextFormat = 1;
}

/**
 * Normalize a completion response's items in place, whatever shape the result takes: a bare item
 * array, a CompletionList, or a single item (completionItem/resolve). Mutates and returns the
 * value; every caller owns the object (freshly parsed off a transport, or a request's own result).
 */
export function normalizeFieldlessSnippets<T>(result: T): T {
	const r = result as unknown;
	if (Array.isArray(r)) for (const item of r) normalizeItem(item as CompletionItemish);
	else if (r && typeof r === 'object') {
		const asList = r as { items?: unknown[] };
		if (Array.isArray(asList.items)) for (const item of asList.items) normalizeItem(item as CompletionItemish);
		else normalizeItem(r as CompletionItemish);
	}
	return result;
}

/**
 * The transport-level form: rewrite a raw server->client JSON message if (and only if) it carries
 * snippet-format completion items. The substring gate keeps the per-message cost at an indexOf for
 * the overwhelming majority of traffic, the same trick observeDiagnostics uses.
 */
export function normalizeCompletionJson(json: string): string {
	if (!json.includes('"insertTextFormat":2')) return json;
	try {
		const msg = JSON.parse(json) as { id?: unknown; result?: unknown };
		// responses only (they have an id); a request or notification is not ours to rewrite
		if (msg.id == null || msg.result == null) return json;
		normalizeFieldlessSnippets(msg.result);
		return JSON.stringify(msg);
	} catch {
		return json;
	}
}
