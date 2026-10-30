import { DEFAULT_DRAW_MODES, DRAW_MODES, type DrawModes } from './drawModes';

const MODES_KEY = 'tikz-editor:draw-modes';

/** the modes picked last, as CAD keeps a tool's last flyout choice */
export function readDrawModes(): DrawModes {
	try {
		const stored = JSON.parse(localStorage.getItem(MODES_KEY) ?? '{}') as Partial<DrawModes>;
		function known(family: keyof DrawModes) {
			return DRAW_MODES[family].some((e) => e.mode === stored[family]);
		}
		return {
			rect: known('rect') ? stored.rect! : DEFAULT_DRAW_MODES.rect,
			round: known('round') ? stored.round! : DEFAULT_DRAW_MODES.round
		};
	} catch {
		return DEFAULT_DRAW_MODES;
	}
}

export function writeDrawModes(modes: DrawModes) {
	try {
		localStorage.setItem(MODES_KEY, JSON.stringify(modes));
	} catch {
		// a private window keeps the choice for the page only
	}
}
