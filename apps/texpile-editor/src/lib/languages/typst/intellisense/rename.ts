// F2 rename for Typst, replacing @codemirror/lsp-client's built-in command.
//
// The built-in one is not wrong so much as half-applied: it walks the server's reply and, for each
// file in it, calls `workspace.getFile(uri)` and SKIPS the file when that returns null. The default
// Workspace only knows files that have an editor view, and Texpile shows one file at a time - so
// renaming a label used in three files patched the open one and dropped the rest on the floor,
// leaving dangling references with no error. This version writes every file tinymist names: the
// open one through the editor (so Ctrl+Z undoes it), the rest straight to disk.
import { showDialog, getDialog, keymap, type EditorView } from '@codemirror/view';
import { Prec, type Extension } from '@codemirror/state';
import { LSPPlugin } from '@codemirror/lsp-client';
import { workspaceRoot } from '$lib/workspace/workspaceStore';
import { readTextFile, writeTextFile, samePath } from '$lib/workspace/fileSystem';
import { toaster } from '$lib/modals/toaster-svelte';
import { m } from '$lib/paraglide/messages';
import { renameTypstSymbol, pathFromUri, type RenameFileEdits } from './lspClient';
import { positionAt, editRange, applyTextEdits } from './textEdits';

const PANEL_CLASS = 'cm-lsp-rename-panel';

/** apply the open file's share in the editor, so it lands on the undo stack like a normal edit */
function applyHere(view: EditorView, edits: RenameFileEdits): void {
	const text = view.state.doc.toString();
	const changes = edits.edits.map((e) => {
		const { from, to } = editRange(text, e);
		return { from, to, insert: e.newText };
	});
	view.dispatch({ changes, userEvent: 'rename' });
}

/** everything else is written through the filesystem: those files have no view to dispatch into */
async function applyElsewhere(target: RenameFileEdits): Promise<void> {
	const before = await readTextFile(target.path);
	await writeTextFile(target.path, applyTextEdits(before, target.edits));
}

async function doRename(view: EditorView, newName: string): Promise<void> {
	const plugin = LSPPlugin.get(view);
	const word = view.state.wordAt(view.state.selection.main.head);
	if (!plugin || !word) return;
	const here = pathFromUri(plugin.uri);

	try {
		// the server computes against ITS copy of the document; flush pending changes first or the
		// position we send points into a document it has not seen yet
		plugin.client.sync();
		const targets = await renameTypstSymbol(workspaceRoot.current, here, positionAt(view.state.doc.toString(), word.from), newName);
		if (!targets.length) {
			toaster.info({ title: m.typst_rename_nothing(), duration: 3000 });
			return;
		}

		let files = 0;
		let occurrences = 0;
		for (const t of targets) {
			occurrences += t.edits.length;
			files++;
			if (samePath(t.path, here)) applyHere(view, t);
			else await applyElsewhere(t);
		}
		// the count is the point: it is the only way to see that files you cannot see were written
		toaster.success({ title: m.typst_rename_done({ occurrences, files }), duration: 4000 });
	} catch (e) {
		toaster.error({ title: m.typst_rename_failed(), description: e instanceof Error ? e.message : String(e) });
	}
}

/** F2: prompt for a new name for the symbol under the cursor, then rename it project-wide. */
export function renameTypstSymbolCommand(view: EditorView): boolean {
	const wordRange = view.state.wordAt(view.state.selection.main.head);
	const plugin = LSPPlugin.get(view);
	// capabilities are known only once the server has answered initialize; absent means "not yet",
	// which is not the same as "cannot", so only an explicit refusal disables the key
	if (!wordRange || !plugin || plugin.client.serverCapabilities?.renameProvider === false) return false;
	const word = view.state.sliceDoc(wordRange.from, wordRange.to);

	// a second F2 while the prompt is open re-seeds it rather than stacking another panel
	const open = getDialog(view, PANEL_CLASS);
	if (open) {
		const input = open.dom.querySelector('[name=name]') as HTMLInputElement | null;
		if (input) {
			input.value = word;
			input.select();
		}
		return true;
	}

	const { close, result } = showDialog(view, {
		label: m.typst_rename_prompt(),
		input: { name: 'name', value: word },
		focus: true,
		submitLabel: m.typst_rename_submit(),
		class: PANEL_CLASS
	});
	void result.then((form) => {
		view.dispatch({ effects: close });
		const next = form && (form.elements.namedItem('name') as HTMLInputElement | null)?.value;
		if (next && next !== word) void doRename(view, next);
	});
	return true;
}

/** Bound at high precedence so it wins over the identical binding in the client's renameKeymap. */
export const typstRenameKeymap: Extension = Prec.high(keymap.of([{ key: 'F2', run: renameTypstSymbolCommand, preventDefault: true }]));
