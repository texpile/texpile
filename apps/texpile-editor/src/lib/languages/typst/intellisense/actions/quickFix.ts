// Alt-Enter in Typst source: the fixes and rewrites tinymist offers at the caret, as a menu.
import { LSPPlugin } from '@codemirror/lsp-client';
import { forEachDiagnostic } from '@codemirror/lint';
import { keymap, type EditorView } from '@codemirror/view';
import type { ChangeSpec, Extension, Text } from '@codemirror/state';
import { showContextMenu, type ContextMenuItem } from '$lib/menus/contextMenu.svelte';
import { createEntry, normalizePath, underRoot } from '$lib/workspace/fileSystem';
import { workspaceRoot } from '$lib/workspace/workspaceStore';
import { m } from '$lib/paraglide/messages';
import { pathFromUri } from '../lspClient';
import type { LspRange } from '../lspRange.types';

type SnippetTextEdit = { range: LspRange; newText: string; insertTextFormat?: number };
type ResourceOp = { kind: 'create' | 'rename' | 'delete'; uri?: string };
type DocumentEdit = { textDocument?: { uri?: string }; edits?: SnippetTextEdit[] };
type CodeAction = {
	title: string;
	edit?: { changes?: Record<string, SnippetTextEdit[]>; documentChanges?: (DocumentEdit | ResourceOp)[] };
};

export type QuickFixHooks = {
	/** create an empty file (a quick fix for a missing `#include` or image); host only */
	onCreateFile?: (path: string) => Promise<void>;
};

/**
 * A quick fix's new file, created empty - and only inside the open folder: the path is the
 * server's, and a fix is no reason to write anywhere else. Fails rather than overwriting, as the
 * server asked (`overwrite: false`).
 */
export async function createProjectFile(path: string): Promise<void> {
	const root = workspaceRoot.current;
	const target = normalizePath(path);
	if (!root || !underRoot(root, target)) return;
	await createEntry(target, 'file');
	// our own write: the tree shows the file now, not at the watcher's debounce
	dispatchEvent(new CustomEvent('texpile:fs-changed'));
}

/** the edits an action makes to THIS document, and the files it creates; null when it does anything else */
export function actionPlan(action: CodeAction, uri: string): { edits: SnippetTextEdit[]; creates: string[] } | null {
	const edits: SnippetTextEdit[] = [];
	const creates: string[] = [];
	for (const [target, list] of Object.entries(action.edit?.changes ?? {})) {
		if (target !== uri) return null;
		edits.push(...list);
	}
	for (const change of action.edit?.documentChanges ?? []) {
		if ('kind' in change) {
			if (change.kind !== 'create' || !change.uri || !/^file:/i.test(change.uri)) return null;
			creates.push(pathFromUri(change.uri));
		} else {
			if (change.textDocument?.uri !== uri) return null;
			edits.push(...(change.edits ?? []));
		}
	}
	return edits.length || creates.length ? { edits, creates } : null;
}

/** a snippet's text as plain text: `${1:Caption}` keeps its placeholder, `$0` and `$1` go */
export function snippetText(text: string): string {
	return text.replace(/\$\{\d+:([^}]*)\}/g, '$1').replace(/\$\{\d+\}|\$\d+/g, '');
}

function applyPlan(
	view: EditorView,
	plugin: LSPPlugin,
	plan: { edits: SnippetTextEdit[]; creates: string[] },
	hooks: QuickFixHooks,
	asked: Text
): void {
	// the server's ranges are in the text it was asked about; anything since would shift them
	if (plan.edits.length && view.state.doc !== asked) return;
	if (plan.edits.length) {
		const changes: ChangeSpec[] = plan.edits.map((e) => ({
			from: plugin.fromPosition(e.range.start, view.state.doc),
			to: plugin.fromPosition(e.range.end, view.state.doc),
			insert: e.insertTextFormat === 2 ? snippetText(e.newText) : e.newText
		}));
		view.dispatch({ changes, scrollIntoView: true, userEvent: 'input' });
	}
	for (const path of plan.creates) void hooks.onCreateFile?.(path);
	view.focus();
}

async function quickFix(view: EditorView, plugin: LSPPlugin, hooks: QuickFixHooks): Promise<void> {
	const asked = view.state.doc;
	const { from, to, head } = view.state.selection.main;
	const range = { start: plugin.toPosition(from), end: plugin.toPosition(to) };
	// the fixes for a diagnostic are only offered when the diagnostic comes with the request
	const diagnostics: { range: LspRange; message: string; severity: number }[] = [];
	forEachDiagnostic(view.state, (d, dFrom, dTo) => {
		if (dFrom <= to && dTo >= from)
			diagnostics.push({
				range: { start: plugin.toPosition(dFrom), end: plugin.toPosition(dTo) },
				message: d.message,
				severity: d.severity === 'error' ? 1 : 2
			});
	});
	const actions = await plugin.client.request<unknown, CodeAction[] | null>('textDocument/codeAction', {
		textDocument: { uri: plugin.uri },
		range,
		context: { diagnostics }
	});
	const items: ContextMenuItem[] = [];
	for (const action of actions ?? []) {
		const plan = actionPlan(action, plugin.uri);
		// creating a file needs somewhere to create it; the rest of an action is all or nothing
		if (plan && (!plan.creates.length || hooks.onCreateFile))
			items.push({ label: action.title, onclick: () => applyPlan(view, plugin, plan, hooks, asked) });
	}
	const at = view.coordsAtPos(head) ?? { left: 0, bottom: 0 };
	if (!items.length) items.push({ label: m.typst_quick_fix_none(), disabled: true });
	await showContextMenu(items, { x: at.left, y: at.bottom }, { onClose: () => view.focus() });
}

/** Alt-Enter: the fixes and rewrites tinymist offers where the caret is, as a menu */
export function typstQuickFix(hooks: QuickFixHooks): Extension {
	return keymap.of([
		{
			key: 'Alt-Enter',
			preventDefault: true,
			run(view) {
				const plugin = LSPPlugin.get(view);
				if (!plugin) return false;
				plugin.client.sync();
				quickFix(view, plugin, hooks).catch((e) => plugin.reportError(m.typst_quick_fix_failed(), e));
				return true;
			}
		}
	]);
}
