// F12 and Ctrl/Cmd-click in Typst source: to a definition, in another file too, or to the file a
// path names. Through the editor's own LSPPlugin, so a guest is answered by the host's tinymist.
import { LSPPlugin } from '@codemirror/lsp-client';
import { syntaxTree } from '@codemirror/language';
import { EditorView, keymap } from '@codemirror/view';
import type { Extension, StateEffect } from '@codemirror/state';
import { m } from '$lib/paraglide/messages';
import { toaster } from '$lib/modals/toaster-svelte';
import { underRoot } from '$lib/workspace/fileSystem';
import { workspaceRoot } from '$lib/workspace/workspaceStore';
import { pathFromUri } from '../lspClient';
import { relFromSessionUri } from '../guest/sessionUri';
import type { LspPosition, LspRange } from '../lspRange.types';

/** what the caret is on when a click could mean "take me there": a name, a path, a reference */
const NAVIGABLE = new Set(['Ident', 'MathIdent', 'Str', 'Ref', 'RefMarker', 'Label']);

export type GoToHooks = {
	/** open another project file at a 1-based line */
	onOpenFileAt?: (file: string, line: number) => void;
	/** marks the line a jump in this file landed on, as the LaTeX jumps do */
	flash?: (pos: number) => StateEffect<unknown>;
};

/** a Location or a LocationLink, which tinymist sends whatever the client says it supports */
type Target = { uri?: string; range?: LspRange; targetUri?: string; targetSelectionRange?: LspRange; targetRange?: LspRange };
type DocumentLink = { range: LspRange; target?: string };

function navigableAt(view: EditorView, pos: number): boolean {
	const tree = syntaxTree(view.state);
	return NAVIGABLE.has(tree.resolveInner(pos, 1).name) || NAVIGABLE.has(tree.resolveInner(pos, -1).name);
}

/**
 * Where the symbol or path at `pos` leads: its definition, else the file a path names. Asynchronous
 * - the caller has already said yes to the key or click by the time the server answers.
 */
async function goTo(view: EditorView, plugin: LSPPlugin, pos: number, hooks: GoToHooks): Promise<void> {
	const position = plugin.toPosition(pos);
	const textDocument = { uri: plugin.uri };
	const defs = await plugin.client.request<unknown, Target | Target[] | null>('textDocument/definition', { textDocument, position });
	const def = [defs ?? []].flat()[0];
	let uri = def?.targetUri ?? def?.uri;
	let at = def?.targetSelectionRange?.start ?? def?.targetRange?.start ?? def?.range?.start ?? { line: 0, character: 0 };
	if (!uri) {
		// an image, a bibliography: tinymist links those paths rather than defining them
		const links = await plugin.client.request<unknown, DocumentLink[] | null>('textDocument/documentLink', { textDocument });
		const hit = links?.find((l) => l.target && within(l.range, position));
		if (!hit?.target) return;
		uri = hit.target;
		at = { line: 0, character: 0 };
	}
	if (uri === plugin.uri) {
		const offset = plugin.fromPosition(at, view.state.doc);
		view.dispatch({
			selection: { anchor: offset },
			scrollIntoView: true,
			effects: hooks.flash?.(offset),
			userEvent: 'select.definition'
		});
		view.focus();
		return;
	}
	// a guest's answers name session files, which the workspace opens by their project path
	const onDisk = /^file:/i.test(uri);
	const file = onDisk ? pathFromUri(uri) : relFromSessionUri(uri);
	if (!file) return;
	// a package's source sits in Typst's shared cache: opened here, an edit would be saved into every project using it
	const root = workspaceRoot.current;
	if (onDisk && !(root && underRoot(root, file))) {
		toaster.info({ title: m.typst_goto_outside_project(), description: file });
		return;
	}
	hooks.onOpenFileAt?.(file, at.line + 1);
}

function notBefore(a: LspPosition, b: LspPosition): boolean {
	return a.line > b.line || (a.line === b.line && a.character >= b.character);
}

function within(range: LspRange, p: LspPosition): boolean {
	return notBefore(p, range.start) && notBefore(range.end, p);
}

function startGoTo(view: EditorView, pos: number, hooks: GoToHooks): boolean {
	const plugin = LSPPlugin.get(view);
	if (!plugin) return false;
	plugin.client.sync();
	goTo(view, plugin, pos, hooks).catch((e) => plugin.reportError(m.typst_goto_failed(), e));
	return true;
}

/**
 * F12 and Ctrl/Cmd-click. Replaces the client's own F12, which reads only one of the two answer
 * shapes tinymist sends and cannot open another file. A click only counts on something that can
 * lead somewhere, so Ctrl/Cmd-click on plain words still adds a cursor.
 */
export function typstGoTo(hooks: GoToHooks): Extension {
	return [
		keymap.of([{ key: 'F12', run: (view) => startGoTo(view, view.state.selection.main.head, hooks), preventDefault: true }]),
		EditorView.domEventHandlers({
			mousedown(event, view) {
				if (!(event.ctrlKey || event.metaKey) || event.button !== 0) return false;
				const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
				if (pos == null || !navigableAt(view, pos)) return false;
				event.preventDefault();
				return startGoTo(view, pos, hooks);
			}
		})
	];
}
