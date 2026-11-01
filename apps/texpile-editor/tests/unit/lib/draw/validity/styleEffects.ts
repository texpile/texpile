import type { DrawnPart, DrawnPath } from '$lib/draw/editor/drawing/drawing.types';
import type { FigureLanguage, ShapeStyle, StyleFieldSet } from '$lib/draw/editor/figure/figureLanguage';

// whether a style field a statement offers changes how it is drawn, and whether the inspector shows what is drawn;
// each language's style test runs these on every kind of statement it writes

type Field = keyof StyleFieldSet;
type Choices = FigureLanguage['styleChoices'];

function channels(color: string): number[] | null {
	const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());
	if (hex) {
		const h = hex[1].length === 3 ? [...hex[1]].map((c) => c + c).join('') : hex[1];
		return [0, 2, 4].map((k) => parseInt(h.slice(k, k + 2), 16));
	}
	const rgb = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/.exec(color.trim());
	return rgb ? rgb.slice(1, 4).map(Number) : null;
}

function sameColor(a: string | null, b: string | null) {
	const [x, y] = [a && channels(a), b && channels(b)];
	return !!x && !!y && x.every((v, k) => Math.abs(v - y[k]) <= 2);
}

function stroked(parts: DrawnPart[]) {
	return parts.filter((p): p is DrawnPath => p.kind === 'path' && p.stroke !== null);
}

/** the widest line it draws, its own outline; a double line's white middle is TikZ's gap, not a line */
function outlineLine(parts: DrawnPart[]) {
	return outline(stroked(parts).filter((p) => !sameColor(p.stroke, '#fff')));
}

/** the text drawn: glyphs, or the filled outlines an engine draws letters as */
function letters(parts: DrawnPart[]) {
	const glyphs = parts.filter((p) => p.kind === 'glyph');
	return glyphs.length ? glyphs : parts.filter((p) => p.kind === 'path' && p.fill !== null && p.stroke === null);
}

function paintOf(p: DrawnPart) {
	return p.kind === 'image' ? null : p.fill;
}

/** across the box around a path */
function pathSize(p: DrawnPath) {
	const n = (p.d.match(/-?\d*\.?\d+(?:e-?\d+)?/g) ?? []).map(Number);
	const [xs, ys] = [n.filter((_, k) => k % 2 === 0), n.filter((_, k) => k % 2 === 1)];
	return Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
}

/** the path that is the statement's own outline: the widest it draws */
function outline(parts: DrawnPart[]) {
	const paths = parts.filter((p): p is DrawnPath => p.kind === 'path');
	return paths.reduce<DrawnPath | null>((best, p) => (!best || pathSize(p) > pathSize(best) ? p : best), null);
}

function otherChoice<T>(list: readonly T[], now: T | null) {
	return list.find((v) => v !== now) ?? null;
}

function otherColor(now: string | null) {
	return now === 'red' ? 'blue' : 'red';
}

/** what its paths look like, in no order */
function outlineDigest(parts: DrawnPart[]) {
	return parts
		.map((p) => (p.kind === 'path' ? `${p.d}|${p.dash}` : `${p.kind}`))
		.sort()
		.join('\n');
}

function letterDigest(parts: DrawnPart[]) {
	// a glyph's size is its font's, so text grown about its corner can keep every glyph where it was
	return JSON.stringify(letters(parts).map((p) => (p.kind === 'path' ? p.d : p.kind === 'glyph' ? [p.font, p.matrix] : null)));
}

function opacityOf(p: DrawnPart) {
	return p.kind === 'path' ? Math.min(p.fillOpacity, p.strokeOpacity) : p.opacity;
}

function partsOf(parts: DrawnPart[], i: number) {
	return parts.filter((p) => p.stmt === i);
}

/** a value of the field other than the one shown, from the language's own choices; text is tried by its color and its size */
export function probeFor(field: Field | 'textSize', shown: ShapeStyle, choices: Choices): Partial<ShapeStyle> | null {
	switch (field) {
		case 'stroke':
			return { stroke: otherColor(shown.stroke) };
		case 'fill':
			return { fill: otherColor(shown.fill) };
		case 'width':
			return { width: otherChoice([...choices.widths].reverse(), shown.width) };
		case 'dash':
			return { dash: otherChoice(choices.dashes.slice(1), shown.dash) };
		case 'opacity':
			return { opacity: otherChoice(choices.opacities.slice(1), shown.opacity) };
		case 'corners':
			return { corners: shown.corners === 'rounded' ? 'sharp' : 'rounded' };
		case 'arrows':
			return { arrows: otherChoice(choices.arrows.map((a) => a.value).reverse(), shown.arrows) };
		case 'text':
			return { textColor: otherColor(shown.textColor) };
		case 'textSize':
			return { textSize: otherChoice([...choices.textSizes.map((t) => t.value)].reverse(), shown.textSize) };
	}
}

/** why a statement's parts drawn after `change` do not show it, or null when they do; `hex` is the language's swatch */
export function missedChange(change: Partial<ShapeStyle>, before: DrawnPart[], after: DrawnPart[], hex: (color: string) => string | null) {
	const [key, value] = Object.entries(change)[0] as [keyof ShapeStyle, string];
	const wanted = typeof value === 'string' ? hex(value) : null;
	switch (key) {
		case 'stroke': {
			// a state's start arrow keeps its own color, as TikZ's initial arrow does
			const line = outlineLine(after);
			return !line ? 'draws no line' : sameColor(line.stroke, wanted) ? null : `draws its outline ${line.stroke}`;
		}
		case 'fill': {
			const main = outline(after);
			return main && sameColor(main.fill, wanted) ? null : `fills ${main ? 'its outline with ' + main.fill : 'nothing'}`;
		}
		case 'width': {
			const was = stroked(before).map((p) => p.strokeWidth);
			const now = stroked(after).map((p) => p.strokeWidth);
			return now.some((w, k) => Math.abs(w - (was[k] ?? w)) > 1e-3) ? null : 'draws its lines as wide as before';
		}
		case 'dash':
			return stroked(after).some((p, k) => p.dash !== (stroked(before)[k]?.dash ?? null)) ? null : 'draws its lines as before';
		case 'opacity': {
			const changed = after.some((p, k) => before[k] && Math.abs(opacityOf(p) - opacityOf(before[k])) > 1e-3);
			return changed ? null : 'draws as opaque as before';
		}
		case 'corners':
		case 'arrows':
			return outlineDigest(before) !== outlineDigest(after) ? null : 'draws the same outline';
		case 'textSize':
			return letterDigest(before) !== letterDigest(after) ? null : 'draws its text as large as before';
		case 'textColor': {
			// a state's start mark keeps its own color, as TikZ's initial text does
			const text = letters(after);
			return !text.length ? 'draws no text' : text.some((p) => sameColor(paintOf(p), wanted)) ? null : 'draws its text as before';
		}
	}
	return null;
}

/** why what the inspector shows of a statement's stroke or text color is not what is drawn, or null */
export function shownMismatch(fields: StyleFieldSet, shown: ShapeStyle, parts: DrawnPart[], hex: (color: string) => string | null) {
	const stroke = shown.stroke && hex(shown.stroke);
	const line = stroke ? outlineLine(parts) : null;
	if (fields.stroke && line && !sameColor(line.stroke, stroke)) return `shows ${shown.stroke}, draws ${line.stroke}`;
	const text = shown.textColor && hex(shown.textColor);
	const wrongText = letters(parts).filter((p) => !sameColor(paintOf(p), text));
	if (fields.text && text && wrongText.length) return `shows ${shown.textColor} text, draws ${paintOf(wrongText[0])}`;
	return null;
}

const PROBES: [Field, Field | 'textSize'][] = [
	['stroke', 'stroke'],
	['fill', 'fill'],
	['width', 'width'],
	['dash', 'dash'],
	['opacity', 'opacity'],
	['corners', 'corners'],
	['arrows', 'arrows'],
	['text', 'text'],
	['text', 'textSize']
];

/** the swatch a color the language writes is drawn as, its shade mixed in */
function swatchHex(language: FigureLanguage) {
	const { colors } = language.styleChoices;
	return (color: string) => {
		const { base, shade } = colors.split(color);
		const hex = colors.swatches.find(([name]) => name === base)?.[1];
		return hex ? colors.swatchFill(hex, shade) : null;
	};
}

/** every style field the picture's statements offer that does not change how they are drawn, and every one shown
 *  otherwise than drawn: each field is tried on every statement at once, one drawing per field */
export async function styleFindings(
	language: FigureLanguage,
	draw: (source: string) => Promise<{ parts: DrawnPart[]; failed: number[] }>,
	source: string,
	name: string
) {
	const hex = swatchHex(language);
	const picture = language.readPicture(source, 0);
	if (!picture) return [`${name}: no picture`];
	const statements = picture.statements.map((st) => ({
		st,
		described: language.describe(source, st),
		shown: language.readStyle(source, st)
	}));
	const before = await draw(source);
	function label(st: { i: number }, title: string) {
		return `${name} ${st.i} ${title}`;
	}
	const found: string[] = [];
	for (const { st, described, shown } of statements) {
		const wrong = shown && !before.failed.includes(st.i) ? shownMismatch(described.fields, shown, partsOf(before.parts, st.i), hex) : null;
		if (wrong) found.push(`${label(st, described.title)}: ${wrong}`);
	}
	for (const [field, probed] of PROBES) {
		// one that draws nothing yet, as new empty text, has nothing to show a change on
		const tried = statements.filter(
			(s) => s.described.fields[field] && s.shown && !before.failed.includes(s.st.i) && partsOf(before.parts, s.st.i).length
		);
		if (!tried.length) continue;
		const probes = new Map<number, Partial<ShapeStyle>>();
		let text = source;
		for (const { st, described, shown } of [...tried].reverse()) {
			const probe = probeFor(probed, shown!, language.styleChoices);
			const next = probe && language.writeStyle(text, st, probe);
			if (!probe || !next) {
				found.push(`${label(st, described.title)}: offers ${field} and writes none`);
				continue;
			}
			text = next;
			probes.set(st.i, probe);
		}
		const after = await draw(text);
		for (const { st, described } of tried) {
			const probe = probes.get(st.i);
			if (!probe) continue;
			const missed = after.failed.includes(st.i)
				? 'is not drawn'
				: missedChange(probe, partsOf(before.parts, st.i), partsOf(after.parts, st.i), hex);
			if (missed) found.push(`${label(st, described.title)}: ${field} ${JSON.stringify(Object.values(probe)[0])} ${missed}`);
		}
	}
	return found;
}
