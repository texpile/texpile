// @vitest-environment jsdom
// The visual editor's text, handed to tinymist as the open document.
//
// The preview renders the server's in-memory copy, and the visual editor has no CodeMirror plugin
// to keep that copy current - so this stream does. Its failures are all silent ones: a preview a
// save behind, a duplicate didOpen racing the source editor's, a version going backwards, a
// didClose yanking the document out from under the editor that still shows it. Each is pinned
// here against the real LSP client, over a fake bridge that records what reaches the wire.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { flushSync } from 'svelte';
import { EditorView } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { box } from '$lib/runes/box.svelte';
import {
	fileUri,
	stopTypstClient,
	streamTypstDocument,
	syncTypstDocuments,
	typstClient,
	typstLspExtension
} from '$lib/languages/typst/intellisense/lspClient';
import { TypstDocumentStream } from '$lib/languages/typst/intellisense/typstDocumentStream';
import { changeBetween } from '$lib/languages/typst/intellisense/typstWorkspace';
import { scrollTypstPreview } from '$lib/languages/typst/preview/previewCommands';

const ROOT = '/proj';
const MAIN = '/proj/main.typ';
const CHAPTER = '/proj/chapter.typ';

type Wire = {
	id?: number;
	method?: string;
	params?: {
		textDocument?: { uri: string; version?: number; text?: string };
		contentChanges?: { text: string }[];
		command?: string;
	};
};

let wire: Wire[] = [];

/** the bridge answers every request at once; only the initialize reply has anything in it */
function installBridge(): void {
	let deliver: ((raw: string) => void) | null = null;
	const bridge = {
		startLsp: async () => ({ ok: true }),
		send(json: string) {
			const msg = JSON.parse(json) as Wire;
			wire.push(msg);
			if (msg.id === undefined || !msg.method) return;
			const result = msg.method === 'initialize' ? { capabilities: { textDocumentSync: { openClose: true, change: 2 } } } : null;
			deliver?.(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result }));
		},
		onMessage(cb: (raw: string) => void) {
			deliver = cb;
		},
		onExit() {},
		stopLsp() {}
	};
	(window as unknown as { texpileTypst: unknown }).texpileTypst = bridge;
}

function syncMessages(uri: string): Wire[] {
	return wire.filter((m) => /^textDocument\/did(Open|Change|Close)$/.test(m.method ?? '') && m.params?.textDocument?.uri === uri);
}

function kinds(uri: string): string[] {
	return syncMessages(uri).map((m) => m.method!.replace('textDocument/did', '').toLowerCase());
}

function versions(uri: string): number[] {
	return syncMessages(uri).flatMap((m) => (m.params?.textDocument?.version === undefined ? [] : [m.params.textDocument.version]));
}

/** the server's copy as the wire built it, whole-document changes only (every doc here is short) */
function serverText(uri: string): string | null {
	let text: string | null = null;
	for (const m of syncMessages(uri)) {
		if (m.method === 'textDocument/didOpen') text = m.params!.textDocument!.text!;
		else if (m.method === 'textDocument/didChange') text = m.params!.contentChanges!.at(-1)!.text;
		else text = null;
	}
	return text;
}

/** notifications wait on the client's initialize promise; let them reach the wire */
async function settle(ms = 0): Promise<void> {
	await vi.advanceTimersByTimeAsync(ms);
}

async function startServer(): Promise<void> {
	const client = await typstClient(ROOT);
	await client!.initializing;
	await settle();
}

/** the source editor, mounted the way SourceEditor mounts it */
async function mountSourceEditor(path: string, doc: string): Promise<EditorView> {
	const ext = await typstLspExtension(ROOT, path);
	return new EditorView({ state: EditorState.create({ doc, extensions: [ext!] }), parent: document.body });
}

function typeInto(view: EditorView, insert: string): void {
	view.dispatch({ changes: { from: view.state.doc.length, insert } });
}

describe("the visual editor's document stream", () => {
	let path: ReturnType<typeof box<string | null>>;
	let text: ReturnType<typeof box<string>>;
	let stream: TypstDocumentStream;

	beforeEach(() => {
		vi.useFakeTimers();
		wire = [];
		installBridge();
		path = box<string | null>(MAIN);
		text = box('= One');
	});

	afterEach(() => {
		stream?.dispose();
		stopTypstClient();
		streamTypstDocument(null, null, '');
		vi.useRealTimers();
	});

	function startStream(): void {
		stream = new TypstDocumentStream({ getRoot: () => ROOT, getOpenTypstFile: () => path.current, getText: () => text.current });
		flushSync();
	}

	function edit(next: string): void {
		text.current = next;
		flushSync();
	}

	it('sends a typing burst as one debounced didChange, versions climbing', async () => {
		await startServer();
		startStream();
		await settle();
		expect(kinds(fileUri(MAIN))).toEqual(['open']);

		edit('= One t');
		edit('= One tw');
		edit('= One two');
		await settle(150);
		expect(kinds(fileUri(MAIN))).toEqual(['open']); // still typing

		await settle(100);
		expect(kinds(fileUri(MAIN))).toEqual(['open', 'change']);
		expect(serverText(fileUri(MAIN))).toBe('= One two');

		edit('= One two three');
		await settle(250);
		expect(versions(fileUri(MAIN))).toEqual([1, 2, 3]);
		expect(serverText(fileUri(MAIN))).toBe('= One two three');
	});

	it('never starts the server, and a server started later opens the newest text', async () => {
		startStream();
		edit('= Before the server');
		await settle(250);
		expect(wire).toEqual([]);

		await startServer();
		expect(kinds(fileUri(MAIN))).toEqual(['open']);
		expect(serverText(fileUri(MAIN))).toBe('= Before the server');
	});

	it('hands over to the source editor and back without reopening the document', async () => {
		await startServer();
		startStream();
		edit('= Visual');
		// source mode mounts before the debounce fired: the view's text is the truth from here on
		const view = await mountSourceEditor(MAIN, '= Visual');
		await settle();
		typeInto(view, ' then source');
		syncTypstDocuments();
		await settle();
		expect(serverText(fileUri(MAIN))).toBe('= Visual then source');

		// typed, not yet synced, when the source editor goes away: it lands at the hand-back
		typeInto(view, '!');
		view.destroy();
		await settle();
		expect(serverText(fileUri(MAIN))).toBe('= Visual then source!');

		edit('= Visual then source! and visual again');
		await settle(250);
		const again = await mountSourceEditor(MAIN, '= Visual then source! and visual again');
		await settle();
		again.destroy();
		await settle();

		expect(kinds(fileUri(MAIN)).filter((k) => k === 'open')).toHaveLength(1);
		expect(kinds(fileUri(MAIN))).not.toContain('close');
		const seen = versions(fileUri(MAIN));
		expect(seen).toEqual([...seen].sort((a, b) => a - b));
		expect(new Set(seen).size).toBe(seen.length);
		expect(serverText(fileUri(MAIN))).toBe('= Visual then source! and visual again');
	});

	it("leaves the source editor's syncing to its own plugin", async () => {
		await startServer();
		startStream();
		const view = await mountSourceEditor(MAIN, '= One');
		await settle();
		// source typing lands in the buffer too, which the stream follows, but must not time
		typeInto(view, ' two');
		edit('= One two');
		await settle(250);
		expect(kinds(fileUri(MAIN))).toEqual(['open']);
		await settle(300); // the plugin's own 500ms
		expect(kinds(fileUri(MAIN))).toEqual(['open', 'change']);
		view.destroy();
	});

	it('closes the old document on a file switch', async () => {
		await startServer();
		startStream();
		await settle();
		path.current = CHAPTER;
		text.current = '= Chapter';
		flushSync();
		await settle();
		expect(kinds(fileUri(MAIN))).toEqual(['open', 'close']);
		expect(kinds(fileUri(CHAPTER))).toEqual(['open']);
		expect(serverText(fileUri(CHAPTER))).toBe('= Chapter');
	});

	it('closes a file switched away from in source mode once, whichever lets go last', async () => {
		await startServer();
		startStream();
		const view = await mountSourceEditor(MAIN, '= One');
		await settle();
		path.current = CHAPTER;
		text.current = '= Chapter';
		flushSync();
		await settle();
		expect(kinds(fileUri(MAIN))).toEqual(['open']); // the source editor still shows it
		view.destroy();
		await settle();
		expect(kinds(fileUri(MAIN))).toEqual(['open', 'close']);
	});

	it('lets go of the document when leaving the workspace', async () => {
		await startServer();
		startStream();
		stream.dispose();
		await settle();
		expect(kinds(fileUri(MAIN))).toEqual(['open', 'close']);
	});

	it('lands a pending edit before a preview scroll resolves its position', async () => {
		await startServer();
		startStream();
		edit('= One\n\nA new paragraph');
		await scrollTypstPreview(ROOT, 'task', MAIN, 2, 5);
		await settle();
		const change = wire.findIndex((m) => m.method === 'textDocument/didChange');
		// the command, not the method: the server's start already sent tinymist.pinMain the same way
		const scroll = wire.findIndex((m) => m.params?.command === 'tinymist.scrollPreview');
		expect(change).toBeGreaterThan(-1);
		expect(change).toBeLessThan(scroll);
	});
});

describe('the change a sync sends', () => {
	function applied(before: string, after: string): string {
		return changeBetween(before, after)
			.apply(EditorState.create({ doc: before }).doc)
			.toString();
	}

	it('is one range around the edit', () => {
		const changes = changeBetween('= One\nbody\n', '= One\nbody, edited\n');
		const ranges: [number, number, string][] = [];
		changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => ranges.push([fromA, toA, inserted.toString()]));
		expect(ranges).toEqual([[10, 10, ', edited']]);
	});

	it('is empty when nothing moved', () => {
		expect(changeBetween('same', 'same').empty).toBe(true);
	});

	it('never cuts a surrogate pair in half', () => {
		// the emoji share their high surrogate; a range starting between the halves names nothing
		const changes = changeBetween('a😀b', 'a😁b');
		const ranges: [number, number][] = [];
		changes.iterChanges((fromA, toA) => ranges.push([fromA, toA]));
		expect(ranges).toEqual([[1, 3]]);
		expect(applied('a😀b', 'a😁b')).toBe('a😁b');
	});

	it('turns any text into any other', () => {
		for (const [before, after] of [
			['', 'abc'],
			['abc', ''],
			['aaa', 'aa'],
			['aa', 'aaa'],
			['x😀😀y', 'x😀y']
		]) {
			expect(applied(before, after)).toBe(after);
		}
	});
});
