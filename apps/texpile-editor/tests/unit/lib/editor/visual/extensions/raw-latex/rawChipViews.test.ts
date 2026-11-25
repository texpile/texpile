// @vitest-environment jsdom
// a raw chip's node view on the canvas: its drawing in the chip's wrapper when it draws, its source when it does not
import { describe, expect, it } from 'vitest';
import { EditorState, NodeSelection, Plugin, TextSelection } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import { FaceElement, islandNodeViews, type CanvasEvent, type CanvasView } from '$lib/editor/canvas';
import { caretPolicyOf } from '$lib/editor/canvas/geometry/caretPolicy';
import { registerLatexCoreDrawing } from '$lib/languages/latex/visual/core/faces/latexCoreDrawing';
import { schema } from '$lib/languages/latex/schema/latexPMSchema';
import { rawChipViews } from '$lib/editor/visual/extensions/raw-latex/rawChipViews';
import { createTestCanvasView } from '../../../canvas/testing/testCanvasView';
import { chipPanel, closeChipPanel } from '$lib/editor/visual/extensions/drawnChips/chipPanel/chipPanel.svelte';
import type { DrawnChipKind } from '$lib/editor/visual/extensions/drawnChips/chipKind';

function kindOf(block: boolean): DrawnChipKind {
	return { block, language: 'latex', reparse: () => null, settingsFor: () => null, jump: () => {}, jumpToDefinition: () => {} };
}

registerLatexCoreDrawing();
const nodeViews = rawChipViews(islandNodeViews());

/** a paragraph holding the chip, between two words */
function chipView(source: string, decorations: () => Decoration[] = () => []): { view: CanvasView; chip: FaceElement; pos: number } {
	const chip = schema.nodes.inline_latex.create(null, schema.text(source));
	const doc = schema.nodes.doc.create(null, [schema.nodes.paragraph.create(null, [schema.text('a '), chip, schema.text(' b')])]);
	const plugins = [decorationsPlugin(decorations)];
	const view = createTestCanvasView(EditorState.create({ doc, plugins }), { props: { nodeViews } });
	const el = view.nodeDOM(3);
	if (!(el instanceof FaceElement)) throw new Error('the chip has no element');
	return { view, chip: el, pos: 3 };
}

function decorationsPlugin(decorations: () => Decoration[]): Plugin {
	return new Plugin({ props: { decorations: (state) => DecorationSet.create(state.doc, decorations()) } });
}

describe('an inline chip that draws', () => {
	it('draws a footnote as the mark its counter hands it, the note in the hint', () => {
		const { chip, view, pos } = chipView('\\footnote{A note.}', () => [
			Decoration.node(3, 3 + '\\footnote{A note.}'.length + 2, {}, { footnotes: '3' })
		]);
		expect(chip.outerHTML).toBe(
			'<span class="drawn-chip drawn-chip-face" style="cursor: pointer; border-radius: calc(var(--radius-base) * 0.5);">' +
				'<sup class="drawn-footnote" style="margin-left: 0.05em; font-size: 0.75em; line-height: 0; color: var(--color-ref-fg);">3</sup></span>'
		);
		expect(chip.querySelector('sup')?.hint).toBe('A note.');
		expect(caretPolicyOf(view, view.state.doc.nodeAt(pos)!)).toBe('atom');
	});

	it('stands a vertical space on a line of its own, with a press that selects it', () => {
		const { chip, view, pos } = chipView('\\vspace{1em}');
		expect(chip.classList.contains('drawn-chip-line')).toBe(true);
		expect(chip.style.display).toBe('block');
		expect(chip.querySelector('.drawn-vspace-arrow')?.replaced).not.toBeNull();
		expect(caretPolicyOf(view, view.state.doc.nodeAt(pos)!)).toBe('ownLine');
		const press = { type: 'mousedown', button: 0, target: chip } as unknown as CanvasEvent;
		expect(chip.viewDesc?.stopEvent(press)).toBe(true);
		expect(view.state.selection).toBeInstanceOf(NodeSelection);
		expect(view.state.selection.from).toBe(pos);
	});

	it('stands a plain space in the line as one character the keys step over', () => {
		const { chip, view, pos } = chipView('\\quad');
		expect(chip.hasAttribute('data-chip-character')).toBe(true);
		expect(caretPolicyOf(view, view.state.doc.nodeAt(pos)!)).toBe('character');
	});

	it('wears the selected look while selected and drops it after', () => {
		const { chip, view, pos } = chipView('\\vspace{1em}');
		view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, pos)));
		expect(chip.classList.contains('drawn-chip-selected')).toBe(true);
		expect(chip.style.outlineOffset).toBe('1px');
		view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1)));
		expect(chip.classList.contains('drawn-chip-selected')).toBe(false);
		expect(chip.style.outline).toBe('');
	});
});

describe('a chip with no face', () => {
	it('draws its source, which stays while it is typed in', () => {
		const { chip, view, pos } = chipView('\\undefinedcommand{arg}');
		expect(chip.outerHTML).toContain('inline-latex');
		expect(caretPolicyOf(view, view.state.doc.nodeAt(pos)!)).toBe('island');
		view.dispatch(view.state.tr.insertText('x', 12));
		expect(view.nodeDOM(3)).toBe(chip);
	});

	it('is drawn when its source is edited into a drawing', () => {
		const { chip, view } = chipView('\\vspace{1em}x');
		expect(chip.outerHTML).toContain('inline-latex');
		view.dispatch(view.state.tr.delete(16, 17));
		const drawn = view.nodeDOM(3);
		expect(drawn instanceof FaceElement && drawn.classList.contains('drawn-chip')).toBe(true);
	});
});

describe('a placeholder command', () => {
	it('draws \\maketitle as the title block label and a press selects it whole', () => {
		const block = schema.nodes.raw_latex.create(null, schema.text('\\maketitle'));
		const doc = schema.nodes.doc.create(null, [block, schema.nodes.paragraph.create(null, schema.text('After.'))]);
		const view = createTestCanvasView(EditorState.create({ doc }), { props: { nodeViews } });
		const label = view.nodeDOM(0);
		if (!(label instanceof FaceElement)) throw new Error('the placeholder has no element');
		expect(label.className).toBe('latex-placeholder');
		expect(label.textContent).toBe('Title block');
		expect(label.hint).toBe('\\maketitle');
		view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, 0)));
		expect(label.style.getPropertyValue('outline')).toBe('2px solid var(--color-primary-500)');
	});
});

describe('a drawn chip pressed', () => {
	it('opens its panel, which writes its source and leaves the caret after it on Escape', () => {
		const view = createTestCanvasView(
			EditorState.create({
				doc: schema.nodes.doc.create(null, [
					schema.nodes.paragraph.create(null, [
						schema.text('a '),
						schema.nodes.inline_latex.create(null, schema.text('\\vspace{1em}')),
						schema.text(' b')
					])
				])
			}),
			{ props: { nodeViews: rawChipViews(islandNodeViews(), (_view, block) => kindOf(block)) } }
		);
		const chip = view.nodeDOM(3) as unknown as FaceElement;
		chip.viewDesc?.stopEvent({ type: 'mousedown', button: 0, target: chip } as unknown as CanvasEvent);
		expect(chipPanel.request?.source).toBe('\\vspace{1em}');
		chipPanel.request!.write('\\vspace{2em}');
		expect(view.state.doc.nodeAt(3)?.textContent).toBe('\\vspace{2em}');
		closeChipPanel('escape');
		expect(chipPanel.request).toBeNull();
		expect(view.state.selection.from).toBe(3 + view.state.doc.nodeAt(3)!.nodeSize);
	});
});
