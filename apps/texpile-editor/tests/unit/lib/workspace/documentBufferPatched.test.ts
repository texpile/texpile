// @vitest-environment jsdom
// a collaborator's change patched in while this side has two spaces typed in a row: the editor writes the
// paragraph back other than the shared text, and that difference alone goes into the shared doc
import { it, expect } from 'vitest';
import * as Y from 'yjs';
import { EditorState, TextSelection, type Transaction } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { LocalFork } from '$lib/collab/localFork';
import { EDIT_ORIGIN } from '$lib/collab/sharedFiles';
import { applyRemotePatch } from '$lib/collab/remotePatch';
import { DocumentBuffer } from '$lib/workspace/documentBuffer.svelte';
import { parseLatexFile } from '$lib/workspace/latexRoundtrip';

const SOURCE = 'An opening line.\n\nWe prove the estimator is sharp.\n';

it('writes a collaborator’s words once when the patched paragraph reads otherwise', () => {
	const shared = new Y.Doc();
	const text = shared.getText('f');
	text.insert(0, SOURCE);
	const fork = new LocalFork(shared);
	const buffer = new DocumentBuffer({
		textModel: () => ({ text, write: (content, before) => fork.fold(text, content, before, EDIT_ORIGIN) }),
		writeNow: () => {},
		rebuildVisual: () => {},
		isVisualMode: () => true,
		noteLocalEdit: () => {},
		clearPendingAnchor: () => {}
	});
	buffer.openTex('C:/ws/a.tex', SOURCE, '\n');
	const parsed = parseLatexFile(SOURCE);
	buffer.adoptParsed(parsed, SOURCE);
	const at = parsed.doc.child(0).nodeSize + 1 + 'We prove'.length;
	const view = new EditorView(document.body.appendChild(document.createElement('div')), {
		state: EditorState.create({ doc: parsed.doc, selection: TextSelection.create(parsed.doc, at) }),
		dispatchTransaction(this: EditorView, tr: Transaction) {
			this.updateState(this.state.apply(tr));
			if (tr.docChanged && !tr.getMeta('collabRemotePatch')) buffer.onVisualChange(this.state.doc);
		}
	});
	view.dispatch(view.state.tr.insertText(' '));
	const remote = new Y.Doc();
	Y.applyUpdate(remote, Y.encodeStateAsUpdate(shared));
	const theirs = remote.getText('f');
	theirs.insert(theirs.toString().indexOf('sharp') + 5, ' indeed');
	Y.applyUpdate(shared, Y.encodeStateAsUpdate(remote), remote);
	const snapshot = text.toString();
	const next = parseLatexFile(snapshot);
	applyRemotePatch(view, next.doc, buffer.sourceMap, next.map, next.origins, buffer.texSource, snapshot);
	buffer.adoptPatched(next, view.state.doc, snapshot);
	expect(text.toString().match(/indeed/g)).toHaveLength(1);
	expect(text.toString()).toBe(buffer.texSource);
	view.destroy();
	fork.destroy();
});
