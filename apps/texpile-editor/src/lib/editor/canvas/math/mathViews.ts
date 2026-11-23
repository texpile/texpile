// inline_math and block_math views for every language (13.3): a replaced formula and no contentDOM; the MathLive session
// editing the formula is the view's nested editor, started by setSelection
import type { Node as PMNode } from 'prosemirror-model';
import type { Decoration } from 'prosemirror-view';
import {
	environmentNumbering,
	isMathLatexEmpty,
	isSingleLabelEnvironment,
	numberedRows,
	shownRowNumbers,
	type RowNumber
} from '$lib/editor/visual/extensions/mathlivebridge/mathEnvironments';
import { printedTag } from '$lib/languages/latex/visual/extensions/numbers/tagText';
import { compiledNumbersOf } from '$lib/editor/visual/extensions/nodeNumbers';
import { mathMacrosKey } from '$lib/editor/visual/extensions/mathlivebridge/mathMacros.svelte';
import type { MathSource } from '../contracts/faceTypes';
import type { CanvasBuildHelpers, CanvasEvent, CanvasNodeView, CanvasNodeViews } from '../contracts/nodeViewTypes';
import type { EditorLanguage, VisualView } from '../contracts/viewTypes';
import { countOf } from '../document/documentCounters';
import type { FaceElement } from '../tree/faceElement';
import { setLook } from '../tree/faceStyle';
import { DISPLAY_CONTAINER, DISPLAY_FIELD, equationNumber, frameFormula } from './mathLooks';
import { rowNumbersElement } from './rowNumbers';
import { configureMathLive, mathEditingOf, type MathHolder } from './session/mathEditing';
import { pressFormula } from './session/mathPointer';
import type { CanvasMathSession } from './session/mathSession';

/** in place of ProseMirror-selectednode: the formula draws the live field's frame, not the node outline */
const SELECTED = 'math-selected';

function sourceOf(node: PMNode, display: boolean): MathSource {
	return { syntax: node.type.spec.mathSyntax === 'typst' ? 'typst' : 'latex', source: node.textContent, display };
}

/** a LaTeX formula reads the paper's macros: its block is built again when they change */
function formulaOf(node: PMNode, build: CanvasBuildHelpers, display: boolean): FaceElement {
	const source = sourceOf(node, display);
	if (source.syntax === 'latex') build.read({ kind: 'store', name: 'mathMacros' }, mathMacrosKey);
	const formula = build.math(source);
	frameFormula(formula, { empty: isMathLatexEmpty(source.source) });
	return formula;
}

function writeDisplayData(el: FaceElement, node: PMNode, language: EditorLanguage): void {
	const environment = node.attrs.environment || '';
	el.setAttribute('data-label', node.attrs.label || '');
	el.setAttribute('data-numbered', node.attrs.numbered ? 'true' : 'false');
	el.setAttribute('data-environment', environment);
	el.setAttribute('data-numbering', environmentNumbering(environment));
	el.setAttribute('data-line-count', String((node.attrs.lineLabels as string[] | null)?.length || 1));
	// Typst and Markdown start a new paragraph after every display
	if (language === 'latex' && !node.type.spec.plainDisplay) el.setAttribute('data-continues', String(node.attrs.continuesAfter !== false));
}

function countedNumbers(node: PMNode, build: CanvasBuildHelpers, pos: number, single: boolean): string[] {
	const rows: Exclude<RowNumber, 'none'>[] = single ? ['counted'] : shownRowNumbers(node.textContent);
	let next = build.counters.at(pos, 'equation') - countOf(node, 'equation') + 1;
	return (rows.length ? rows : ['counted' as const]).map((row) => (row === 'counted' ? `(${next++})` : (printedTag(row) ?? '')));
}

/** the numbers the language hands the display, or the view's own count where it hands none (renderEquationNumbers):
 *  a per-row environment's as a column, else the one number after the display, which it returns */
function writeNumbers(el: FaceElement, node: PMNode, view: MathNodeView): FaceElement | null {
	const handed = compiledNumbersOf(view.decorations);
	if (!handed && !node.attrs.numbered) return null;
	const environment = node.attrs.environment || '';
	const single = !environment || isSingleLabelEnvironment(environment);
	const numbers = handed ?? countedNumbers(node, view.build, view.getPos() ?? 0, single);
	// LaTeX draws a numbered single number, Typst every number it prints
	if (single) return numbers[0] && (node.attrs.numbered || (view.language === 'typst' && handed?.[0])) ? equationNumber(numbers[0]) : null;
	if (!node.attrs.numbered) return null;
	// A12: each number on the baseline of its own row, none on a \nonumber or \notag row
	let next = 0;
	const perRow = numberedRows(node.textContent).map((numbered) => (numbered ? numbers[next++] || null : null));
	el.appendChild(rowNumbersElement(view.formula, perRow));
	return null;
}

class MathNodeView implements CanvasNodeView, MathHolder {
	readonly dom: FaceElement;
	formula!: FaceElement;
	/** the display's field, which wears the selected frame */
	private field: FaceElement | null = null;
	session: CanvasMathSession | null = null;
	private selected = false;

	constructor(
		private node: PMNode,
		private readonly view: VisualView,
		readonly getPos: () => number | undefined,
		public decorations: readonly Decoration[],
		readonly language: EditorLanguage
	) {
		this.dom = this.build.el(node.isBlock ? 'div' : 'span', node.isBlock ? 'block-math-container' : 'inline-math');
		if (node.isBlock) setLook(this.dom, DISPLAY_CONTAINER);
		this.dom.on.press = pressFormula;
		this.fill();
		const pos = getPos();
		if (pos !== undefined) mathEditingOf(view).adopt(this, pos, node);
	}

	get build(): CanvasBuildHelpers {
		return this.view.canvas.build;
	}

	get nested(): CanvasMathSession | null {
		return this.session;
	}

	/** the parts drawn from the node, built again on every change; the session draws into the new formula */
	private fill(): void {
		const { node, dom } = this;
		const display = node.isBlock;
		this.formula = formulaOf(node, this.build, display);
		if (display) {
			writeDisplayData(dom, node, this.language);
			this.field = this.build.el('div', 'math-static-placeholder');
			setLook(this.field, DISPLAY_FIELD);
			this.field.appendChild(this.formula);
			dom.replaceChildren(this.field);
			dom.generatedAfter = writeNumbers(dom, node, this);
		} else dom.replaceChildren(this.formula);
		this.frameSelected();
		this.session?.attach(this.formula, true);
	}

	update(node: PMNode, decorations: readonly Decoration[]): boolean {
		if (node.type !== this.node.type) return false;
		const same = node.eq(this.node) && String(compiledNumbersOf(decorations)) === String(compiledNumbersOf(this.decorations));
		this.node = node;
		this.decorations = decorations;
		if (same) return true;
		this.fill();
		return true;
	}

	selectNode(): void {
		this.selected = true;
		this.frameSelected();
	}

	deselectNode(): void {
		this.selected = false;
		this.frameSelected();
	}

	private frameSelected(): void {
		this.dom.classList.toggle(SELECTED, this.selected);
		frameFormula(this.field ?? this.formula, { selected: this.selected && this.view.editable });
	}

	setSelection(): void {
		const pos = this.getPos();
		if (pos !== undefined) mathEditingOf(this.view).select(this, pos, this.node);
	}

	/** the formula's keys and clipboard are its session's */
	stopEvent(event: CanvasEvent): boolean {
		return !!this.session && /^(key|copy|cut|paste)/.test(event.type);
	}

	hold(session: CanvasMathSession | null): void {
		this.session = session;
	}

	destroy(): void {
		if (this.session && this.view.isDestroyed) this.session.end('destroy');
	}
}

/** Markdown's displays are plain: no number, gear or placement */
export function mathNodeViews(language: EditorLanguage): CanvasNodeViews {
	configureMathLive();
	function view(node: PMNode, editor: VisualView, getPos: () => number | undefined, decorations: readonly Decoration[]): CanvasNodeView {
		return new MathNodeView(node, editor, getPos, decorations, language);
	}
	return { inline_math: view, block_math: view };
}
