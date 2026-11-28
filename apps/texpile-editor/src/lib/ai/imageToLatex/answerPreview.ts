// The answer as the dialog shows it: a drawing through the figure engine, which also says whether it compiles, or a
// formula through MathLive. Anything else is shown as its source
import { convertLatexToMarkup, convertTypstToMarkup } from 'mathlive';
import { m } from '$lib/paraglide/messages';
import { figureProvider } from '$lib/draw/host/engine/figureProvider';
import { documentPreamble } from '$lib/draw/host/engine/documentPreamble';
import { drawingToSvg } from '$lib/draw/editor/drawing/drawingSvg';
import type { ImageDialect } from './imagePrompt';
import type { PreviewPlace } from './imageToLatexRequest';

export type AnswerPreview =
	| { kind: 'drawing'; svg: string }
	/** fixable by the model; the engine itself missing is not */
	| { kind: 'drawing-error'; error: string; fixable: boolean }
	| { kind: 'math'; markup: string }
	| { kind: 'source' };

const LATEX_DISPLAY = /^(?:\\\[([\s\S]*)\\\]|\$\$([\s\S]*)\$\$|\\begin\{(align|gather|equation|multline)\*?\}([\s\S]*)\\end\{\3\*?\})$/;
const TYPST_DISPLAY = /^\$([\s\S]*)\$$/;

function mathMarkup(source: string, dialect: ImageDialect): string | null {
	if (dialect === 'typst') {
		const body = TYPST_DISPLAY.exec(source)?.[1];
		return body === undefined || body.includes('$') ? null : convertTypstToMarkup(body.trim(), { defaultMode: 'math' });
	}
	const hit = LATEX_DISPLAY.exec(source);
	if (!hit) return null;
	const body = hit[1] ?? hit[2] ?? hit[4] ?? '';
	// MathLive lays aligned lines out in aligned, which takes the same & and \\
	const shown = hit[3] ? `\\begin{aligned}${body}\\end{aligned}` : body;
	return convertLatexToMarkup(shown.trim(), { defaultMode: 'math' });
}

// the libraries a drawing names above its picture, and TikZ itself where the document has not loaded it yet
function previewPreamble(own: string, source: string, from: number): string {
	const above = source.slice(0, from).trim();
	const tikz = /\\usepackage(?:\[[^\]]*\])?\{[^}]*\btikz\b/.test(own) ? '' : '\\usepackage{tikz}';
	return [own, tikz, above].filter(Boolean).join('\n');
}

async function drawingPreview(source: string, dialect: ImageDialect, place: PreviewPlace): Promise<AnswerPreview | null> {
	if (dialect === 'markdown') return null;
	const path = dialect === 'typst' && !/\.typ$/i.test(place.path) ? `${place.path}.typ` : place.path;
	let at = 0;
	const { language, engine } = figureProvider(path, {
		root: () => place.root,
		preamble: async () => previewPreamble(await documentPreamble(place.path, place.text, place.at), source, at)
	});
	const found = language.listPictures(source);
	if (!found.length) return null;
	at = found[0].from;
	const picture = language.readPicture(source, 0);
	if (!picture) return null;
	try {
		const drawn = await language.render(engine, source, picture);
		if (drawn.errors.length) return { kind: 'drawing-error', error: drawn.errors[0], fixable: true };
		return { kind: 'drawing', svg: drawingToSvg(drawn.drawing, drawn.fonts, drawn.outline) };
	} catch (e) {
		const error = e instanceof Error ? e.message : String(e);
		const missing = error === m.figure_needs_lualatex() || error === m.figure_needs_tinymist();
		return { kind: 'drawing-error', error, fixable: !missing };
	}
}

export async function answerPreview(source: string, dialect: ImageDialect, place: PreviewPlace | null): Promise<AnswerPreview> {
	const markup = mathMarkup(source, dialect);
	if (markup !== null) return { kind: 'math', markup };
	return (place && (await drawingPreview(source, dialect, place))) || { kind: 'source' };
}
