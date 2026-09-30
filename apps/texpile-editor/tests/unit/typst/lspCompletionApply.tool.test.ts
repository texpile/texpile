// @vitest-environment jsdom
// Reproduces the caret landing right after '#' when accepting a completion from the bare-'#'
// popup, while the same item accepted after typing '#al' lands correctly inside align(|).
//
// Runs the REAL @codemirror/lsp-client + autocomplete against a fake transport answering with
// tinymist's exact measured item shapes (lsp-item-shape probe): identical snippet newText
// "align(${1:})", differing only in textEdit range - empty at the cursor for bare '#', covering
// the typed "al" otherwise.
import { describe, it, expect } from 'vitest';
import { EditorView } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { LSPClient, languageServerSupport } from '@codemirror/lsp-client';
import type { Transport } from '@codemirror/lsp-client';
import { startCompletion, acceptCompletion, currentCompletions } from '@codemirror/autocomplete';
import { normalizeCompletionJson } from '$lib/languages/typst/intellisense/completion/completionNormalize';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

// jsdom has no layout, so CodeMirror's measure cycle can throw inside a rAF callback - after the
// view is destroyed, even - and an uncaught error there fails the run despite every test passing.
// The measurements are meaningless here anyway; only the state machine under test matters.
const rawRaf = globalThis.requestAnimationFrame;
globalThis.requestAnimationFrame = (cb: FrameRequestCallback) =>
	rawRaf((t) => {
		try {
			cb(t);
		} catch {
			/* jsdom layout artifact */
		}
	});

/** a server that answers like the measured tinymist: snippet items whose range tracks the query */
function fakeServer(): Transport {
	const handlers = new Set<(v: string) => void>();
	const reply = (msg: unknown) => {
		// the same rewrite the real transports apply on the way in
		const json = normalizeCompletionJson(JSON.stringify(msg));
		queueMicrotask(() => {
			for (const h of handlers) h(json);
		});
	};
	return {
		send(raw: string) {
			const msg = JSON.parse(raw);
			if (msg.method === 'initialize') {
				reply({
					jsonrpc: '2.0',
					id: msg.id,
					result: {
						capabilities: {
							textDocumentSync: 1,
							completionProvider: { triggerCharacters: ['#', '(', '.', '@'] }
						}
					}
				});
			} else if (msg.method === 'textDocument/completion') {
				const { line, character } = msg.params.position;
				// mirror tinymist: the edit range spans from just after '#' to the cursor -
				// empty when nothing is typed yet, covering the query otherwise
				reply({
					jsonrpc: '2.0',
					id: msg.id,
					result: {
						isIncomplete: false,
						// align deliberately NOT first: in the real 232-item list at bare '#'
						// something else sorts first, and completionResultRange takes item 0's range
						items: [
							...['abs', 'align', 'angle'].map((label) => ({
								label,
								kind: 3,
								insertTextFormat: 2,
								textEdit: {
									newText: label + '(${1:})',
									range: { start: { line, character: 1 }, end: { line, character } }
								}
							})),
							// tinymist marks these snippet-format too, with NO field in the text -
							// 71 of the 232 items at a bare '#' have this exact shape
							{
								label: 'alignment',
								kind: 6,
								insertTextFormat: 2,
								textEdit: {
									newText: 'alignment',
									range: { start: { line, character: 1 }, end: { line, character } }
								}
							}
						]
					}
				});
			} else if (msg.id != null) {
				reply({ jsonrpc: '2.0', id: msg.id, result: null });
			}
		},
		subscribe(h: (v: string) => void) {
			handlers.add(h);
		},
		unsubscribe(h: (v: string) => void) {
			handlers.delete(h);
		}
	};
}

async function editorWithLsp(doc: string, cursor: number) {
	const client = new LSPClient();
	client.connect(fakeServer());
	await client.initializing;
	const view = new EditorView({
		state: EditorState.create({
			doc,
			selection: { anchor: cursor },
			extensions: [languageServerSupport(client, 'file:///proj/main.typ', 'typst')]
		}),
		parent: document.body
	});
	return { view, client };
}

async function openAndAccept(view: EditorView) {
	startCompletion(view);
	for (let i = 0; i < 60 && currentCompletions(view.state).length === 0; i++) await wait(50);
	expect(currentCompletions(view.state).length).toBeGreaterThan(0);
	await wait(100); // clear autocomplete's interactionDelay guard, which rejects instant accepts
	expect(acceptCompletion(view)).toBe(true);
	await wait(20);
}

async function typeText(view: EditorView, text: string) {
	for (const ch of text) {
		const head = view.state.selection.main.head;
		view.dispatch({
			changes: { from: head, insert: ch },
			selection: { anchor: head + 1 },
			userEvent: 'input.type'
		});
		await wait(60);
	}
}

describe('accepting a tinymist snippet completion', () => {
	it("lands inside the parens when accepted from '#al'", async () => {
		const { view, client } = await editorWithLsp('#al', 3);
		await openAndAccept(view);
		expect(view.state.doc.toString()).toBe('#align()');
		expect(view.state.selection.main.head).toBe(7); // inside align(|)
		view.destroy();
		client.disconnect();
	});

	it("lands inside the parens when accepted from a bare '#'", async () => {
		const { view, client } = await editorWithLsp('#', 1);
		startCompletion(view);
		for (let i = 0; i < 60 && currentCompletions(view.state).length === 0; i++) await wait(50);
		// the user's real flow: the popup is open on the full list, they type to filter, accept
		await typeText(view, 'al');
		for (let i = 0; i < 60 && currentCompletions(view.state).length > 2; i++) await wait(50);
		// 'al' still matches 'alignment' too; accept takes the top-ranked option, which is 'align'
		expect(currentCompletions(view.state)[0]?.label).toBe('align');
		await wait(100);
		expect(acceptCompletion(view)).toBe(true);
		await wait(20);
		expect(view.state.doc.toString()).toBe('#align()');
		expect(view.state.selection.main.head).toBe(7); // inside align(|), NOT right after '#'
		view.destroy();
		client.disconnect();
	});

	it("puts the caret after a field-LESS item accepted from a bare '#'", async () => {
		// The bug this whole file exists for. tinymist marks plain-word items as snippets; VS Code
		// gives a snippet without $0 an implicit final cursor, CodeMirror does not - no field, no
		// selection, and the caret is left mapped BEFORE an insert at an empty range, i.e. right
		// after '#'. The transport normalizer reclassifies these as plain text, whose apply sets
		// the selection explicitly.
		const { view, client } = await editorWithLsp('#', 1);
		startCompletion(view);
		for (let i = 0; i < 60 && currentCompletions(view.state).length === 0; i++) await wait(50);
		await typeText(view, 'alignm'); // filter down to the field-less 'alignment'
		for (let i = 0; i < 60 && currentCompletions(view.state).length !== 1; i++) await wait(50);
		expect(currentCompletions(view.state).map((c) => c.label)).toEqual(['alignment']);
		await wait(100);
		expect(acceptCompletion(view)).toBe(true);
		await wait(20);
		expect(view.state.doc.toString()).toBe('#alignment');
		expect(view.state.selection.main.head).toBe(10); // after the word, not stranded at '#|alignm...'
		view.destroy();
		client.disconnect();
	});
});
