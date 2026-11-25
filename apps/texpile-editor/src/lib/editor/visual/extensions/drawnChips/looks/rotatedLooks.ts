import type { StyleLook } from '$lib/editor/canvas';

export const ROTATED_LOOKS: Readonly<Record<string, StyleLook>> = {
	// the DOM editor's turn by a half for \rotatebox{90} never applied in the editor, so both turns read top to bottom
	'drawn-rotated': { display: 'inline-block', writingMode: 'vertical-rl' }
};
