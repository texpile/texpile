import type { CetzPicture } from './picture';
import { splitStatements } from './syntax';

/** a picture's markers are hairline L shapes in a color that carries the statement number; see svgToDrawing */
export const MARK_WIDTH = '0.0137';
const DEFAULT_CETZ = '0.4.2';

/** the document's set-up before the picture: its imports, definitions and set rules, as the picture sees them */
export function pictureContext(source: string, picture: CetzPicture) {
	const out: string[] = [];
	for (const m of source.slice(0, picture.from).matchAll(/^#(import|let|set|show)\b/gm)) {
		const at = m.index!;
		const span = splitStatements(source, at + 1, picture.from)[0];
		if (!span || span.from !== at + 1) continue;
		const text = source.slice(at, span.to);
		// the page is the engine's own: sized to the picture, nothing around it
		if (/^#set\s+page\b/.test(text)) continue;
		out.push(text);
	}
	return out.join('\n');
}

/** the job the engine compiles: the set-up, a page the size of the picture, and a marker before every statement, on
 *  its line, so the picture's lines are the source's from `firstLine` on */
export function instrumentPicture(source: string, picture: CetzPicture, leaveOut: number[] = []) {
	const context = pictureContext(source, picture);
	const version = /@preview\/cetz:([\d.]+)/.exec(context)?.[1] ?? DEFAULT_CETZ;
	// a statement left out draws nothing, on as many lines as it had
	const gone = picture.statements.filter((s) => leaveOut.includes(s.i));
	function kept(at: number) {
		return !gone.some((s) => s.from < at && at < s.to);
	}
	const marks = [
		{ at: picture.bodyFrom, mark: 'tcmark(0); ' },
		...picture.statements.map((s) => ({ at: s.from, mark: `tcmark(${s.i}); ` })),
		// a turned statement's second marker, after its turn, gives its own transform
		...picture.statements.flatMap((s) => (s.turn ? [{ at: s.turn.call.to, mark: `; tcown(${s.i})` }] : []))
	]
		.filter((m) => kept(m.at))
		.map((m) => ({ ...m, to: m.at }));
	const blanks = gone.map((s) => ({ at: s.from, to: s.to, mark: `none${source.slice(s.from, s.to).replace(/[^\n]/g, '')}` }));
	// a blank and the marker before it start at one place: the blank goes in first, the marker before it
	const cuts = [...blanks, ...marks].sort((a, b) => b.at - a.at || b.to - a.to);
	let text = source.slice(picture.from, picture.to);
	for (const c of cuts) text = `${text.slice(0, c.at - picture.from)}${c.mark}${text.slice(c.to - picture.from)}`;
	const head = [
		context,
		'#set page(width: auto, height: auto, margin: 0pt, fill: none, header: none, footer: none, background: none, foreground: none, numbering: none)',
		`#import "@preview/cetz:${version}" as tc-cetz`,
		`#let tcmark(i, own: 1) = tc-cetz.draw.floating(tc-cetz.draw.line((1, 0), (0, 0), (0, 1), stroke: ${MARK_WIDTH}pt + rgb(own, calc.quo(i, 256), calc.rem(i, 256))))`,
		'#let tcown(i) = tcmark(i, own: 2)'
	].join('\n');
	const firstLine = source.slice(0, picture.from).split('\n').length;
	return { job: `${head}\n#${text}\n`, headLines: head.split('\n').length, firstLine };
}
