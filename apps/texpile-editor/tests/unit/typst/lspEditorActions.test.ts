// @vitest-environment jsdom
//
// The tinymist features drawn outside the CodeMirror client, against a real LSPClient talking to a
// scripted server: where F12 lands for each shape of answer tinymist sends, the color swatches it
// places, and which quick fixes can be applied here.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EditorView } from '@codemirror/view';
import { Compartment, EditorState } from '@codemirror/state';
import { LSPClient, LSPPlugin, type Transport } from '@codemirror/lsp-client';
import { typstLanguage } from '$lib/languages/typst/source/typstLanguage';
import { typstGoTo } from '$lib/languages/typst/intellisense/actions/goToDefinition';
import { actionPlan, snippetText, typstQuickFix } from '$lib/languages/typst/intellisense/actions/quickFix';
import { closeContextMenu, openMenu } from '$lib/menus/contextMenu.svelte';
import { choosePresentation, typstColorSwatches } from '$lib/languages/typst/intellisense/actions/colorSwatches';
import { workspaceRoot } from '$lib/workspace/workspaceStore';

// jsdom lays nothing out; CodeMirror measures ranges when it scrolls a jump into view
if (!Range.prototype.getClientRects) {
	Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
	Range.prototype.getBoundingClientRect = () => new DOMRect();
}

const URI = 'file:///p/main.typ';
type Req = { id?: number; method?: string; params?: { position?: { line: number; character: number } } };

/** a server that answers each method from `answers`, by function or by value */
function fakeServer(answers: Record<string, unknown | ((req: Req) => unknown)>): Transport {
	const handlers = new Set<(v: string) => void>();
	return {
		send(message: string) {
			const msg = JSON.parse(message) as Req;
			if (msg.id === undefined) return;
			const a = msg.method === 'initialize' ? { capabilities: { textDocumentSync: 2 } } : answers[msg.method!];
			const result = typeof a === 'function' ? (a as (r: Req) => unknown)(msg) : (a ?? null);
			queueMicrotask(() => handlers.forEach((h) => h(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result }))));
		},
		subscribe: (h) => void handlers.add(h),
		unsubscribe: (h) => void handlers.delete(h)
	};
}

let view: EditorView | null = null;
afterEach(() => {
	view?.destroy();
	view = null;
});

async function editor(doc: string, answers: Record<string, unknown | ((req: Req) => unknown)>, opened: [string, number][] = []) {
	workspaceRoot.current = '/p';
	const client = new LSPClient({ rootUri: 'file:///p' }).connect(fakeServer(answers));
	await client.initializing;
	view = new EditorView({
		state: EditorState.create({
			doc,
			extensions: [
				typstLanguage(),
				LSPPlugin.create(client, URI, 'typst'),
				typstGoTo({ onOpenFileAt: (f, l) => opened.push([f, l]) }),
				typstColorSwatches(),
				typstQuickFix({})
			]
		}),
		parent: document.body
	});
	return view;
}

const settle = () => new Promise((r) => setTimeout(r, 20));

function pressF12(v: EditorView, at: number): void {
	v.dispatch({ selection: { anchor: at } });
	v.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'F12', bubbles: true, cancelable: true }));
}

describe('F12', () => {
	it('moves the caret to a definition in the same file, from a LocationLink', async () => {
		const doc = '#let helper() = [hi]\n#helper()\n';
		const v = await editor(doc, {
			'textDocument/definition': [
				{ targetUri: URI, targetSelectionRange: { start: { line: 0, character: 5 }, end: { line: 0, character: 11 } } }
			]
		});
		pressF12(v, doc.indexOf('#helper()') + 2);
		await settle();
		expect(v.state.selection.main.head).toBe(5);
	});

	it('opens the file a definition lives in, at its line', async () => {
		const opened: [string, number][] = [];
		const v = await editor(
			'#import "lib.typ": helper\n#helper()\n',
			{
				'textDocument/definition': [
					{ uri: 'file:///p/lib.typ', range: { start: { line: 3, character: 5 }, end: { line: 3, character: 11 } } }
				]
			},
			opened
		);
		pressF12(v, 28);
		await settle();
		expect(opened).toEqual([['/p/lib.typ', 4]]);
	});

	it('leaves a definition in a package, outside the project, unopened', async () => {
		const opened: [string, number][] = [];
		const v = await editor(
			'#import "@preview/cetz:0.3.0": canvas\n#canvas()\n',
			{
				'textDocument/definition': [
					{
						uri: 'file:///cache/typst/packages/preview/cetz/0.3.0/src/lib.typ',
						range: { start: { line: 9, character: 5 }, end: { line: 9, character: 11 } }
					}
				]
			},
			opened
		);
		pressF12(v, 40);
		await settle();
		expect(opened).toEqual([]);
	});

	it('falls back to the linked file for a path with no definition, like an image', async () => {
		const opened: [string, number][] = [];
		const v = await editor(
			'#image("fig.png")\n',
			{
				'textDocument/definition': null,
				'textDocument/documentLink': [
					{ range: { start: { line: 0, character: 7 }, end: { line: 0, character: 16 } }, target: 'file:///p/fig.png' }
				]
			},
			opened
		);
		pressF12(v, 10);
		await settle();
		expect(opened).toEqual([['/p/fig.png', 1]]);
	});

	it('does nothing when the server knows nothing there', async () => {
		const opened: [string, number][] = [];
		const v = await editor('Plain words.\n', { 'textDocument/definition': null, 'textDocument/documentLink': [] }, opened);
		pressF12(v, 3);
		await settle();
		expect(opened).toEqual([]);
		expect(v.state.selection.main.head).toBe(3);
	});
});

describe('color swatches', () => {
	it('draws one before each color the server reports', async () => {
		const v = await editor('#rect(fill: rgb("#ff0000"))\n', {
			'textDocument/documentColor': [
				{ range: { start: { line: 0, character: 12 }, end: { line: 0, character: 26 } }, color: { red: 1, green: 0, blue: 0, alpha: 1 } }
			]
		});
		await settle();
		const swatches = v.dom.querySelectorAll<HTMLElement>('.cm-typst-swatch');
		expect(swatches).toHaveLength(1);
		// jsdom writes an opaque rgba() back as rgb()
		expect(swatches[0].style.backgroundColor).toBe('rgb(255, 0, 0)');
	});

	it('opens the picker from an input in the page, placed on the swatch', async () => {
		const v = await editor('#rect(fill: rgb("#ff0000"))\n', {
			'textDocument/documentColor': [
				{ range: { start: { line: 0, character: 12 }, end: { line: 0, character: 26 } }, color: { red: 1, green: 0, blue: 0, alpha: 1 } }
			]
		});
		await settle();
		const swatch = v.dom.querySelector<HTMLElement>('.cm-typst-swatch')!;
		swatch.getBoundingClientRect = () => new DOMRect(40, 60, 12, 12);
		const opened: HTMLInputElement[] = [];
		const click = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(function (this: HTMLInputElement) {
			opened.push(this);
		});
		swatch.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
		click.mockRestore();
		// a detached input opened Chromium's picker in the window's corner
		expect(opened).toHaveLength(1);
		expect(opened[0].isConnected).toBe(true);
		expect([opened[0].style.left, opened[0].style.top]).toEqual(['40px', '60px']);
		expect(opened[0].value).toBe('#ff0000');
	});

	it('replaces the literal where it stands after text was typed before it', async () => {
		let at = 12;
		const v = await editor('#rect(fill: red)\n', {
			'textDocument/documentColor': () => [
				{
					range: { start: { line: 0, character: at }, end: { line: 0, character: at + 3 } },
					color: { red: 1, green: 0, blue: 0, alpha: 1 }
				}
			],
			'textDocument/colorPresentation': [{ label: '"#0000ff"' }, { label: 'rgb("#0000ff")' }]
		});
		await settle();
		v.dispatch({ changes: { from: 0, insert: '  ' } });
		at = 14;
		// past the refresh a typed change schedules
		await new Promise((r) => setTimeout(r, 450));
		const opened: HTMLInputElement[] = [];
		const click = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(function (this: HTMLInputElement) {
			opened.push(this);
		});
		v.dom.querySelector<HTMLElement>('.cm-typst-swatch')!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
		click.mockRestore();
		opened[0].value = '#0000ff';
		opened[0].dispatchEvent(new Event('change'));
		await settle();
		expect(v.state.doc.toString()).toBe('  #rect(fill: rgb("#0000ff"))\n');
	});
});

describe('color swatches, late server', () => {
	it('appear once the LSP extension is added to an editor already showing', async () => {
		const client = new LSPClient({ rootUri: 'file:///p' }).connect(
			fakeServer({
				'textDocument/documentColor': [
					{ range: { start: { line: 0, character: 11 }, end: { line: 0, character: 14 } }, color: { red: 0, green: 0, blue: 1, alpha: 1 } }
				]
			})
		);
		await client.initializing;
		const lsp = new Compartment();
		view = new EditorView({
			state: EditorState.create({ doc: '#box(fill: blue)\n', extensions: [typstLanguage(), lsp.of([]), typstColorSwatches()] }),
			parent: document.body
		});
		await settle();
		expect(view.dom.querySelectorAll('.cm-typst-swatch')).toHaveLength(0);
		view.dispatch({ effects: lsp.reconfigure(LSPPlugin.create(client, URI, 'typst')) });
		await settle();
		expect(view.dom.querySelectorAll('.cm-typst-swatch')).toHaveLength(1);
	});
});

describe('quick fixes', () => {
	afterEach(() => closeContextMenu());

	const deeper = [
		{
			title: 'Increase depth of heading',
			edit: { changes: { [URI]: [{ range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } }, newText: '==' }] } }
		}
	];

	/** Alt-Enter, then the first fix on the menu, after `meanwhile` */
	async function applyFirstFix(v: EditorView, meanwhile?: () => void): Promise<void> {
		v.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', altKey: true, bubbles: true, cancelable: true }));
		await settle();
		meanwhile?.();
		const [first] = openMenu.current!.items;
		if ('onclick' in first) first.onclick?.();
	}

	it('applies a fix, but not over text that changed since the server was asked', async () => {
		const v = await editor('= Title\n', { 'textDocument/codeAction': deeper });
		await applyFirstFix(v);
		expect(v.state.doc.toString()).toBe('== Title\n');
		await applyFirstFix(v, () => v.dispatch({ changes: { from: 0, insert: 'x\n' } }));
		expect(v.state.doc.toString()).toBe('x\n== Title\n');
	});
});

describe('actionPlan', () => {
	const edit = { range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } }, newText: '==' };

	it('takes an action whose edits are all to this document', () => {
		expect(actionPlan({ title: 'Increase depth of heading', edit: { changes: { [URI]: [edit] } } }, URI)).toEqual({
			edits: [edit],
			creates: []
		});
	});

	it('takes a file creation, as a path', () => {
		const create = { title: 'Create missing file', edit: { documentChanges: [{ kind: 'create' as const, uri: 'file:///p/missing.typ' }] } };
		expect(actionPlan(create, URI)).toEqual({ edits: [], creates: ['/p/missing.typ'] });
	});

	it('refuses an action that edits another file or deletes one, rather than applying half of it', () => {
		expect(actionPlan({ title: 'x', edit: { changes: { [URI]: [edit], 'file:///p/other.typ': [edit] } } }, URI)).toBeNull();
		expect(actionPlan({ title: 'x', edit: { documentChanges: [{ kind: 'delete' as const, uri: 'file:///p/a.typ' }] } }, URI)).toBeNull();
		expect(actionPlan({ title: 'a command, no edit' }, URI)).toBeNull();
	});
});

describe('snippetText', () => {
	it('keeps placeholders and drops tab stops', () => {
		expect(snippetText('figure(\n  caption: [${1:Caption}],\n  image("fig.png")\n)$0')).toBe(
			'figure(\n  caption: [Caption],\n  image("fig.png")\n)'
		);
		expect(snippetText('a$1b${2}c')).toBe('abc');
	});
});

describe('choosePresentation', () => {
	// what tinymist 0.15 answers for #0080ff, in its order
	const labels = [
		'"#0080ff"',
		'rgb("#0080ff")',
		'luma(51.19%)',
		'oklab(61.41%, -0.05, -0.205)',
		'oklch(61.41%, 0.211, 256.22deg)',
		'cmyk(100%, 50%, 0%, 0%)'
	];
	const blue = { red: 0, green: 0.5, blue: 1, alpha: 1 };

	it('keeps the form the literal is written in', () => {
		expect(choosePresentation('rgb("#ff0000")', labels, blue)).toBe('rgb("#0080ff")');
		expect(choosePresentation('oklch(50%, 0.1, 20deg)', labels, blue)).toBe('oklch(61.41%, 0.211, 256.22deg)');
		expect(choosePresentation('cmyk(0%, 0%, 0%, 100%)', labels, blue)).toBe('cmyk(100%, 50%, 0%, 0%)');
	});

	it('never puts the bare string in place of a color', () => {
		expect(choosePresentation('red', labels, blue)).toBe('rgb("#0080ff")');
	});

	it('leaves luma for rgb when the new color is not gray', () => {
		expect(choosePresentation('luma(50%)', labels, blue)).toBe('rgb("#0080ff")');
		expect(choosePresentation('luma(50%)', ['rgb("#808080")', 'luma(50%)'], { red: 0.5, green: 0.5, blue: 0.5, alpha: 1 })).toBe(
			'luma(50%)'
		);
	});
});
