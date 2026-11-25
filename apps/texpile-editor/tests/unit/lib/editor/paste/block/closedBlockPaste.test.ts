// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import type { CanvasView } from '$lib/editor/canvas';
import { visualSmartPaste } from '$lib/editor/paste/visualSmartPaste';
import { pasteLatexText } from '$lib/editor/visual/extensions/latexClipboard';
import { treeToProseMirror } from '$lib/languages/latex/parser/tree/importTree';
import { schema } from '$lib/languages/latex/schema/latexPMSchema';
import { createTestCanvasView, settleTestView } from '../../canvas/testing/testCanvasView';

globalThis.ClipboardEvent ??= class extends Event {
	clipboardData = null;
} as unknown as typeof ClipboardEvent;

class TestClipboardData {
	private readonly data = new Map<string, string>();
	getData(type: string): string {
		return this.data.get(type) ?? '';
	}
	setData(type: string, value: string): void {
		this.data.set(type, value);
	}
	clearData(): void {
		this.data.clear();
	}
}

function clipboardEvent(type: 'copy' | 'cut' | 'paste', data: TestClipboardData): ClipboardEvent {
	const event = new Event(type, { bubbles: true, cancelable: true });
	Object.defineProperty(event, 'clipboardData', { value: data });
	return event as ClipboardEvent;
}

const SOURCE = '\\section{Title}\n\nFirst one.\n\nSecond one here.\n\nThird one.\n';

async function editor(): Promise<CanvasView> {
	const { doc } = treeToProseMirror(SOURCE);
	const view = createTestCanvasView(EditorState.create({ doc, plugins: [visualSmartPaste('latex', schema, pasteLatexText)] }));
	await settleTestView(view);
	return view;
}

function blocks(view: CanvasView): string[] {
	const out: string[] = [];
	view.state.doc.forEach((node) => out.push(`${node.type.name}:${node.textContent}`));
	return out;
}

function positionOf(view: CanvasView, text: string, offset: number): number {
	let found = -1;
	view.state.doc.descendants((node, pos) => {
		if (node.isText && found < 0 && node.text!.includes(text)) found = pos + node.text!.indexOf(text) + offset;
	});
	return found;
}

function cutWhole(view: CanvasView, text: string): TestClipboardData {
	const from = positionOf(view, text, 0);
	view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, from, from + text.length)));
	const data = new TestClipboardData();
	view.dispatchEvent(clipboardEvent('cut', data));
	return data;
}

function pasteAt(view: CanvasView, pos: number, data: TestClipboardData): void {
	view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pos)));
	view.dispatchEvent(clipboardEvent('paste', data));
}

describe('a whole paragraph through the clipboard', () => {
	it('cut removes the block and writes a closed slice', async () => {
		const view = await editor();
		const data = cutWhole(view, 'Second one here.');
		expect(blocks(view)).toEqual(['heading:Title', 'paragraph:First one.', 'paragraph:Third one.']);
		expect(data.getData('text/html')).toContain('data-pm-slice="0 0');
		expect(data.getData('text/plain')).toBe('Second one here.');
		view.destroy();
	});

	it('pastes as its own block before, after or on an empty paragraph, and inline inside text', async () => {
		const view = await editor();
		const data = cutWhole(view, 'Second one here.');
		pasteAt(view, positionOf(view, 'Third one.', 0), data);
		expect(blocks(view).slice(2)).toEqual(['paragraph:Second one here.', 'paragraph:Third one.']);
		view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, positionOf(view, 'First one.', 10))));
		view.dispatchEvent(clipboardEvent('paste', data));
		expect(blocks(view)).toHaveLength(5);
		pasteAt(view, positionOf(view, 'First one.', 5), data);
		expect(blocks(view)).toHaveLength(5);
		expect(blocks(view)[1]).toBe('paragraph:FirstSecond one here. one.');
		view.destroy();
	});
});
