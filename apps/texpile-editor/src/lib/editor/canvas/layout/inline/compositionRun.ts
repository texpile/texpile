// an input method's underline under its preedit, which is document text (D16)
import type { LineBox } from '../../contracts/layoutTypes';

/** one textformatupdate range, offsets from the top-level block's start */
export type CompositionFormat = { readonly from: number; readonly to: number; readonly thickness: 'none' | 'thin' | 'thick' };
export type CompositionUnderline = { readonly x: number; readonly width: number; readonly y: number; readonly thickness: number };

// what Chromium draws when the input method gives no format: a line 1.5 px thick, 3 px under the baseline
const DEFAULT_THICKNESS = 1.5;
const BELOW_BASELINE = 3;
const THICKNESS = { none: 0, thin: 1, thick: 2 };

/** prefixWidth: the drawn width of a text fragment's first characters */
export function compositionUnderlines(
	line: LineBox,
	preedit: { readonly from: number; readonly to: number },
	formats: readonly CompositionFormat[],
	prefixWidth: (fragment: LineBox['fragments'][number] & { kind: 'text' }, length: number) => number
): CompositionUnderline[] {
	const found: CompositionUnderline[] = [];
	const ranges = formats.length
		? formats.map((format) => ({ ...format, width: THICKNESS[format.thickness] }))
		: [{ ...preedit, width: DEFAULT_THICKNESS }];
	for (const format of ranges) {
		const thickness = format.width;
		if (!thickness) continue;
		for (const fragment of line.fragments) {
			if (fragment.kind !== 'text' || fragment.to <= format.from || fragment.from >= format.to) continue;
			const start = fragment.x + prefixWidth(fragment, Math.max(0, format.from - fragment.from));
			const end = fragment.x + prefixWidth(fragment, Math.min(fragment.to, format.to) - fragment.from);
			found.push({ x: start, width: end - start, y: line.baseline + BELOW_BASELINE, thickness });
		}
	}
	return found;
}
