// the looks of the carets and the selection: app.css's .ProseMirror-gapcursor and .pm-blur-cursor, remoteCursors.css and the drop line
import type { AnimationRef, StyleLook, ThemeToken } from '../contracts/styleTypes';

function blink(name: string, durationMs: number): AnimationRef {
	return {
		name,
		durationMs,
		delayMs: 0,
		timing: 'step-end',
		iterations: Infinity,
		direction: 'normal',
		fillMode: 'none',
		playState: 'running'
	};
}

/** px; the bar is the plugin's :after, `top` from the block's edge */
export const GAP_CURSOR_LOOK = {
	width: 20,
	thickness: 1,
	top: -2,
	colorToken: '--color-surface-950-50' as ThemeToken,
	animation: blink('pm-caret-blink', 1100)
};

/** the caret while focus sits in an overlay: a text-colored bar `heightEm` tall around the line's middle */
export const BLUR_CARET_LOOK = { width: 1, heightEm: 1.1, animation: blink('pm-caret-blink', 1060) };

export const LOCAL_CARET_WIDTH = 1;
export const MATH_CARET_TOKEN: ThemeToken = '--color-surface-950-50';
export const SELECTION_FILL_TOKEN: ThemeToken = '--editor-selection';
export const MACRO_OUTLINE_TOKEN: ThemeToken = '--color-primary-500';

/** a collaborator's caret bar and name label; the color is the peer's */
export function remoteCaretLooks(color: string): { bar: StyleLook; label: StyleLook; linger: AnimationRef } {
	return {
		bar: { position: 'absolute', left: '-1px', top: '0px', bottom: '0px', width: 'calc(var(--spacing) * 0.5)', backgroundColor: color },
		label: {
			position: 'absolute',
			top: '-1.35em',
			left: '-1px',
			padding: '0px calc(var(--spacing) * 1)',
			borderRadius: 'calc(var(--radius-base) * 0.75)',
			fontSize: '0.7em',
			fontWeight: '600',
			lineHeight: '1.5',
			color: 'rgb(255 255 255)',
			backgroundColor: color,
			whiteSpace: 'nowrap',
			userSelect: 'none',
			pointerEvents: 'none'
		},
		// opacity 1 for the first 70% of 3 s, then 0
		linger: { ...blink('pm-remote-label-linger', 3000), timing: 'ease', iterations: 1 }
	};
}

/** the block handle's drop line */
export const DROP_LINE_LOOK: StyleLook = {
	position: 'absolute',
	top: '-1px',
	left: '0px',
	right: '0px',
	height: '2px',
	backgroundColor: 'var(--color-primary-500)'
};
