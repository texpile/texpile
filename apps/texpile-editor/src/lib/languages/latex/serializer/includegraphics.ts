// the \includegraphics an image node is written as
import type { Node } from 'prosemirror-model';
// direct, not through the image barrel: that one pulls in svelte and the DOM
import { DEFAULT_FIGURE_FRACTION } from '$lib/editor/visual/extensions/image/figureDefaults';

/** Drop width=/scale=/height= entries from an \includegraphics option list (keep trim, clip, angle…). */
function stripSizeKeys(opts: string): string {
	return opts
		.split(',')
		.map((s) => s.trim())
		.filter((s) => s && !/^(width|scale|height|totalheight)\s*=/.test(s))
		.join(', ');
}

/**
 * Rebuild the \includegraphics for an image node.
 * - resized in the editor (width/maxWidth set): emit width=<frac>\textwidth, keeping other
 *   captured options (trim/clip/angle) and replacing the original size keys.
 * - options === '': the source had no brackets, emit \includegraphics{src} verbatim.
 * - options a non-empty string: emit it verbatim.
 * - options == null (editor-created, never resized): the default width.
 */
export function buildIncludegraphics(node: Node): string {
	const src = String(node.attrs.src ?? '');
	const options = node.attrs.options as string | null;
	const w = Number(node.attrs.width);
	const mw = Number(node.attrs.maxWidth);
	if (Number.isFinite(w) && Number.isFinite(mw) && mw > 0) {
		const frac = Math.round((w / mw) * 100) / 100; // resize already snaps; this guards stray values
		const rest = stripSizeKeys(typeof options === 'string' ? options : '').split(', ');
		// an angle before width, so width sizes the turned image
		const turn = rest.filter((o) => /^angle\s*=/.test(o));
		const opts = [...turn, `width=${frac}\\textwidth`, ...rest.filter((o) => o && !turn.includes(o))].join(', ');
		return `\\includegraphics[${opts}]{${src}}`;
	}
	if (options === '') return `\\includegraphics{${src}}`;
	if (typeof options === 'string') return `\\includegraphics[${options}]{${src}}`;
	return `\\includegraphics[width=${DEFAULT_FIGURE_FRACTION}\\textwidth]{${src}}`;
}
