import {
	autocompletion,
	insertCompletionText,
	snippet,
	type Completion,
	type CompletionContext,
	type CompletionResult
} from '@codemirror/autocomplete';
import { EditorState, type ChangeDesc, type Extension, type Text } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { LSPPlugin } from '@codemirror/lsp-client';

type LspPosition = { line: number; character: number };
type LspRange = { start: LspPosition; end: LspPosition };
type LspTextEdit = { range: LspRange; newText: string };
export type LspCompletionItem = {
	label: string;
	kind?: number;
	detail?: string;
	documentation?: string | { kind: 'plaintext' | 'markdown'; value: string };
	sortText?: string;
	filterText?: string;
	insertText?: string;
	insertTextFormat?: number;
	textEdit?: LspTextEdit | { insert: LspRange; replace: LspRange; newText: string };
	additionalTextEdits?: LspTextEdit[];
	commitCharacters?: string[];
};
type LspCompletionList = { isIncomplete?: boolean; items: LspCompletionItem[] };
/** request-time document offsets from LSP positions; LSPPlugin.fromPosition is the live one */
export type PositionMap = (pos: LspPosition, doc: Text) => number;

const KIND_TO_TYPE: Record<number, string> = {
	1: 'text',
	2: 'method',
	3: 'function',
	4: 'class',
	5: 'property',
	6: 'variable',
	7: 'class',
	8: 'interface',
	9: 'namespace',
	10: 'property',
	11: 'keyword',
	12: 'constant',
	13: 'constant',
	14: 'keyword',
	16: 'constant',
	20: 'constant',
	21: 'constant',
	22: 'class',
	25: 'type'
};

function triggerFor(plugin: LSPPlugin, ch: string): { triggerKind: number; triggerCharacter?: string } | null {
	const triggers = plugin.client.serverCapabilities?.completionProvider?.triggerCharacters;
	if (triggers?.includes(ch)) return { triggerKind: 2, triggerCharacter: ch };
	if (/[a-zA-Z_]/.test(ch)) return { triggerKind: 1 };
	return null;
}

// codemirror fix
function toSnippetTemplate(text: string): string {
	return text.replace(/\\([$}\\])|\$(\d+)/g, (_m, esc: string | undefined, field: string | undefined) => esc ?? `\${${field}}`);
}

// translate cm inconsistency to vscode like behavior when applying
export function applyLspItem(
	view: EditorView,
	completion: Completion,
	item: LspCompletionItem,
	doc: Text,
	fromPosition: PositionMap,
	since: ChangeDesc | null,
	wordFrom: number,
	caret: number
): void {
	function map(p: number): number {
		return since ? since.mapPos(p) : p;
	}
	const text = item.textEdit?.newText ?? item.insertText ?? item.label;
	const range = item.textEdit ? ('range' in item.textEdit ? item.textEdit.range : item.textEdit.replace) : null;
	const start = range ? map(fromPosition(range.start, doc)) : wordFrom;
	const end = Math.max(caret, range ? map(fromPosition(range.end, doc)) : caret);
	const extra = (item.additionalTextEdits ?? []).map((e) => ({
		from: map(fromPosition(e.range.start, doc)),
		to: map(fromPosition(e.range.end, doc)),
		insert: e.newText
	}));
	if (item.insertTextFormat === 2) {
		// the extra edits first, so the snippet's fields land where the text ended up
		let from = start;
		let to = end;
		if (extra.length) {
			const tr = view.state.update({ changes: extra, userEvent: 'input.complete' });
			view.dispatch(tr);
			from = tr.changes.mapPos(start, 1);
			to = tr.changes.mapPos(end, 1);
		}
		snippet(toSnippetTemplate(text))(view, completion, from, to);
		return;
	}
	view.dispatch(insertCompletionText(view.state, text, start, end), { changes: extra });
}

function buildResult(
	plugin: LSPPlugin,
	doc: Text,
	list: LspCompletionList,
	from: number,
	to: number,
	since: ChangeDesc | null
): CompletionResult {
	const options: Completion[] = list.items.map((item) => ({
		label: item.filterText ?? item.label,
		displayLabel: item.label,
		type: item.kind === undefined ? undefined : KIND_TO_TYPE[item.kind],
		detail: item.detail,
		sortText: item.sortText,
		commitCharacters: item.commitCharacters,
		// eslint-disable-next-line id-denylist -- CodeMirror's own field name
		info: item.documentation
			? () => {
					const el = document.createElement('div');
					el.className = 'cm-lsp-documentation cm-lsp-completion-documentation';
					el.innerHTML = plugin.docToHTML(item.documentation!);
					return el;
				}
			: undefined,
		apply: (view, completion, applyFrom, applyTo) =>
			applyLspItem(view, completion, item, doc, (p, d) => plugin.fromPosition(p, d), since, applyFrom, applyTo)
	}));
	return {
		from,
		to,
		options,
		validFor: list.isIncomplete ? undefined : /^\w*$/,
		// pure: a fresh result per mapping, so the same changes can be mapped through twice without harm
		map: (_result, changes) => buildResult(plugin, doc, list, from, to, since ? since.composeDesc(changes) : changes)
	};
}

export async function typstCompletionSource(context: CompletionContext): Promise<CompletionResult | null> {
	const plugin = context.view ? LSPPlugin.get(context.view) : null;
	if (!plugin) return null;
	const trigger = context.explicit ? { triggerKind: 1 } : triggerFor(plugin, context.state.sliceDoc(context.pos - 1, context.pos));
	if (!trigger) return null;
	plugin.client.sync();
	const doc = context.state.doc;
	const params = { textDocument: { uri: plugin.uri }, position: plugin.toPosition(context.pos, doc), context: trigger };
	context.addEventListener('abort', () => plugin.client.cancelRequest(params));
	let result: LspCompletionList | LspCompletionItem[] | null;
	try {
		result = await plugin.client.request<typeof params, LspCompletionList | LspCompletionItem[] | null>('textDocument/completion', params);
	} catch (e) {
		if ((e as { code?: number }).code === -32800) return null; // cancelled
		throw e;
	}
	if (!result) return null;
	const list = Array.isArray(result) ? { items: result } : result;
	// nothing: no result at all, so the next keystroke asks again instead of trusting an empty list
	if (!list.items.length) return null;
	const word = context.matchBefore(/\w*$/);
	return buildResult(plugin, doc, list, word ? word.from : context.pos, context.pos, null);
}

/** the completion extension for an editor bound to a tinymist client */
export function typstCompletion(): Extension {
	return [autocompletion(), EditorState.languageData.of(() => [{ autocomplete: typstCompletionSource }])];
}
