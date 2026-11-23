// a widget's canvas form (9.4): the `canvas` field its producer adds to the spec
import type { CanvasWidget, WidgetDecorationView } from '../contracts/decorationTypes';

const reported = new Set<string>();

/** null: the widget takes no space; a dev build names it once */
export function canvasWidgetOf(widget: WidgetDecorationView): CanvasWidget | null {
	const form = widget.spec.canvas ?? null;
	const name = widget.key ?? 'unkeyed';
	if (!form && import.meta.env?.DEV && !reported.has(name)) {
		reported.add(name);
		console.warn(`[canvas] widget ${name} has no canvas form and takes no space`);
	}
	return form;
}
