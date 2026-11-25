import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { Plugin } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import type { CanvasViewMembers, VisualView } from '$lib/editor/canvas';

const NARROWED = path.resolve(__dirname, '../../../../../../../src/lib/editor/canvas/contracts/typings/prosemirrorView.d.ts');
const UPSTREAM = path.join(path.dirname(createRequire(import.meta.url).resolve('prosemirror-view')), 'index.d.ts');

function withoutEditorView(declarations: string, start: RegExp, end: RegExp): string {
	const from = declarations.search(start);
	const to = declarations.slice(from).search(end) + from;
	return declarations.slice(0, from) + declarations.slice(to);
}

// compile-time samples: svelte-check fails when a ts-expect-error below stops being an error
function readsContentEditable(view: CanvasViewMembers): boolean {
	const dom = view.nodeDOM(0);
	// @ts-expect-error the form caretBlocks and gapArrows read; on the canvas a face's caret policy answers it (D13)
	return dom instanceof HTMLElement && dom.isContentEditable;
}
function castsNodeToDom(view: CanvasViewMembers): boolean {
	// @ts-expect-error nodeDOM answers a FaceElement (a cast to HTMLElement | null still passes)
	return (view.nodeDOM(0) as HTMLElement).isContentEditable;
}
// upstream's EditorView has private members and no canvas; Z's deletion of the transitional members leaves CanvasViewMembers
function swapsWithTheStandIn(view: EditorView, visual: VisualView): [VisualView, EditorView] {
	return [view, visual];
}
const pluginSeesTheStandIn = new Plugin({
	props: {
		handleKeyDown(view) {
			// @ts-expect-error a library's EditorView is the stand-in too: updateRoot is a DOM editor member
			view.updateRoot();
			return false;
		}
	}
});

describe('the narrowed prosemirror-view typings', () => {
	it('equal the installed declarations except the EditorView class', () => {
		const upstream = withoutEditorView(
			readFileSync(UPSTREAM, 'utf8'),
			/\/\*\*\nAn editor view manages/,
			/\/\*\*\nThe type of function \[provided\]/
		);
		const narrowed = withoutEditorView(
			readFileSync(NARROWED, 'utf8'),
			/\/\/ canvas: the narrowed/,
			/\/\*\*\nThe type of function \[provided\]/
		).replace("import type { VisualView } from '../viewTypes';\n", '');
		expect(narrowed).toBe(upstream);
	});

	it('keep the compile-time samples', () => {
		expect([readsContentEditable, castsNodeToDom, swapsWithTheStandIn, pluginSeesTheStandIn].length).toBe(4);
	});
});
