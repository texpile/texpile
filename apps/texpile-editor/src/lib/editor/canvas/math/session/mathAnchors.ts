// the HTML pop-ups of a formula placed from the session's rects (13.9): math search, the math menu, the macro panel
import { onScreen, placeAt, type MathSearchPlace } from '$lib/editor/visual/extensions/mathlivebridge/mathSearch/mathSearch.svelte';
import { showMathMenu } from '$lib/editor/visual/extensions/mathlivebridge/mathMenu/showMathMenu';
import { blockSettingsAt } from '$lib/editor/visual/extensions/blockHandle/blockSettings';
import type { CanvasMathSession } from './mathSession';

export class MathAnchors {
	constructor(private readonly session: CanvasMathSession) {}

	/** math search: under the formula's line at the caret, above it when there is no room below */
	searchPlace(): MathSearchPlace | null {
		const formula = this.session.formulaClientRect();
		if (!onScreen(formula.top, formula.bottom)) return null;
		const caret = this.session.caretClientRect();
		return placeAt(caret?.left ?? formula.left, formula.top, formula.bottom);
	}

	/** Texpile's math menu at a point, or at the math caret for a key (Alt+Space, the context menu key) */
	openMenu(at?: { x: number; y: number }): boolean {
		const { session } = this;
		const { view } = session;
		const caret = session.caretClientRect();
		const formula = session.formulaClientRect();
		const point = at ?? (caret ? { x: caret.right, y: caret.bottom } : { x: formula.left, y: formula.bottom });
		const editable = view.editable;
		showMathMenu(
			session.field,
			{
				view,
				pos: session.pos,
				syntax: session.syntax,
				editable,
				openSettings: () => blockSettingsAt(view, session.pos)?.open()
			},
			point
		);
		return true;
	}
}

const anchors = new WeakMap<CanvasMathSession, MathAnchors>();

export function anchorsOf(session: CanvasMathSession): MathAnchors {
	let found = anchors.get(session);
	if (!found) anchors.set(session, (found = new MathAnchors(session)));
	return found;
}
