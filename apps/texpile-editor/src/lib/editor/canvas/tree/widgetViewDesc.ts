// prosemirror-view's WidgetViewDesc (9.4): inline widgets in contentDOM, block ones in the parent's flow, rows in a table
import { DecorationSet, type Decoration } from 'prosemirror-view';
import type { CanvasWidget, WidgetDecorationView, WidgetSpec } from '../contracts/decorationTypes';
import { canvasWidgetOf } from '../decorations/widgetRegistry';
import { createFaceBuildContext, type FaceBuildScope } from '../views/faceContext';
import { widgetSide } from '../decorations/decorationAttrs';
import { sameOuterDecorations } from './decorationElements';
import type { FaceElement } from './faceElement';

/** where the widget stands now: its handlers read it long after the build */
type WidgetPlace = { base: () => number; offset: number };

function widgetDom(form: CanvasWidget | null, place: WidgetPlace, scope: FaceBuildScope): FaceElement | null {
	if (form?.kind !== 'inline' && form?.kind !== 'block' && form?.kind !== 'tableRow') return null;
	return form.build(createFaceBuildContext(scope, { pos: () => place.base() + place.offset, decorations: [], inner: DecorationSet.empty }));
}

export class WidgetViewDesc {
	readonly kind = 'widget';

	private constructor(
		readonly decoration: Decoration,
		/** pos counts from the start of the top-level block */
		readonly widget: WidgetDecorationView,
		readonly form: CanvasWidget | null,
		/** null for the forms the caret layer or the inline engine draw without an element (caret, struck, lineEnd) */
		readonly dom: FaceElement | null,
		private readonly place: WidgetPlace
	) {}

	/** offset: from the start of the top-level block; base: the position of that start, for build contexts */
	static create(decoration: Decoration, offset: number, base: () => number, scope: FaceBuildScope): WidgetViewDesc {
		const spec = decoration.spec as WidgetSpec & { marks?: WidgetDecorationView['marks'] };
		const widget: WidgetDecorationView = {
			pos: offset,
			side: widgetSide(decoration),
			key: spec.key,
			spec,
			marks: spec.marks ?? null,
			ignoreSelection: !!spec.ignoreSelection
		};
		const form = canvasWidgetOf(widget);
		const place = { base, offset };
		return new WidgetViewDesc(decoration, widget, form, widgetDom(form, place, scope), place);
	}

	/** the same widget as prosemirror-view's placeWidget sees it: same key, or same toDOM and spec */
	sameWidget(decoration: Decoration): boolean {
		return this.decoration === decoration || sameOuterDecorations([this.decoration], [decoration]);
	}

	/** a widget moved by an edit keeps its elements and takes its new place */
	moved(decoration: Decoration, offset: number, base: () => number): WidgetViewDesc {
		Object.assign(this.place, { base, offset });
		if (this.widget.pos === offset && this.decoration === decoration) return this;
		return new WidgetViewDesc(decoration, { ...this.widget, pos: offset }, this.form, this.dom, this.place);
	}

	destroy(): void {
		this.widget.spec.destroy?.(this.dom);
	}
}
