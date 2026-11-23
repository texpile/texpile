// a cell styles itself from its node decorations: the rules it prints, its side, the guide under the caret and a selected cell's wash
import type { Decoration, EditorView } from 'prosemirror-view';
import type { CanvasNodeViewConstructor, FaceElement, OverlaySpec, VisualView } from '$lib/editor/canvas';
import { decorationAttrsOf, faceElement, renderFaceSpec, setLook } from '$lib/editor/canvas';
import type { CellEdges, TableRuleSpec } from '../rules/tableRules';
import { cellHoverLook, cellLook, SELECTED_CELL_LOOK } from './tableLooks';
import ColumnResizeHandle from './ColumnResizeHandle.svelte';
import { columnResizeKey, startColumnDrag } from './columnResize';

function edgesOf(decorations: readonly Decoration[]): CellEdges | null {
	for (const d of decorations) {
		const spec = d.spec as TableRuleSpec;
		if ('edgeTop' in spec)
			return {
				top: spec.edgeTop ?? null,
				bottom: spec.edgeBottom ?? null,
				left: Boolean(spec.edgeLeft),
				right: Boolean(spec.edgeRight),
				align: spec.edgeAlign ?? null
			};
	}
	return null;
}

function washOf(decorations: readonly Decoration[]): FaceElement | null {
	if (!decorations.some((d) => decorationAttrsOf(d).class?.split(' ').includes('selectedCell'))) return null;
	const wash = faceElement('span');
	wash.generated = true;
	setLook(wash, SELECTED_CELL_LOOK);
	return wash;
}

/** the border a Typst column drags by, on the cell the pointer is beside */
function resizeHandle(view: VisualView, getPos: () => number | undefined): readonly OverlaySpec[] {
	const pos = getPos();
	const state = columnResizeKey.getState(view.state);
	if (pos === undefined || state?.activeHandle !== pos) return [];
	const handle: OverlaySpec = {
		key: 'column-resize',
		component: ColumnResizeHandle,
		props: { onpress: (event: MouseEvent) => startColumnDrag(view as unknown as EditorView, pos, event) },
		anchor: {},
		placement: 'inFlow',
		when: 'always'
	};
	return [handle];
}

/** `printed`: the language prints the table's own rules (LaTeX, Typst); Markdown cells carry a plain border */
export function tableCellView(printed: boolean): CanvasNodeViewConstructor {
	return (node, view, getPos, decorations) => {
		const { dom, contentDOM } = renderFaceSpec(node.type.spec.toDOM!(node));
		const header = node.type.name === 'table_header';
		function dress(outer: readonly Decoration[]): void {
			const edges = edgesOf(outer);
			dom.states = printed ? { hover: cellHoverLook(edges) } : null;
			setLook(dom, cellLook({ printed, header, edges, guide: outer.some((d) => (d.spec as { caretGuide?: boolean }).caretGuide) }));
			dom.generatedAfter = washOf(outer);
		}
		dress(decorations);
		return {
			dom,
			contentDOM,
			overlays: (ui) => (ui.readOnly ? [] : resizeHandle(view, getPos)),
			update(next, nextDecorations) {
				if (!next.sameMarkup(node)) return false;
				dress(nextDecorations);
				return true;
			}
		};
	};
}
