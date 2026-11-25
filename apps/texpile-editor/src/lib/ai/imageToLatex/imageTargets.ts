// Where a converted picture goes in either editor: below the picture it came from, or at the caret for a paste. The
// package a drawing or aligned equation needs goes in with it, as Insert adds it
import { TextSelection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import type { EditorView as CMView } from '@codemirror/view';
import { textNow } from '$lib/buffers/textNow';
import { activeFilePath, workspaceRoot } from '$lib/workspace/workspaceStore';
import { amsmathFor, ensurePackage, TIKZ } from '$lib/chrome/menubar/insert/packageOnInsert';
import { CETZ_IMPORT, importsCetz } from '$lib/draw/cetz/source/pictures';
import { withLibrary } from '$lib/draw/tikz/source/options/libraries';
import { activeCm } from '$lib/chrome/menuBarCommands';
import { editPreambleHere } from '$lib/stores/editorStore';
import type { ImageDialect } from './imagePrompt';
import type { ImageToLatexTarget, PreviewPlace } from './imageToLatexRequest';

const LIBRARY_LINE = /^[ \t]*\\usetikzlibrary\s*\{([^}]*)\}[ \t]*\n?/gm;

/** the answer's \usetikzlibrary lines go to the preamble with the packages */
function withoutLibraryLines(dialect: ImageDialect, source: string): { source: string; libraries: string[] } {
	if (dialect !== 'latex') return { source, libraries: [] };
	const libraries = [...source.matchAll(LIBRARY_LINE)].flatMap((m) => m[1].split(',').map((l) => l.trim())).filter(Boolean);
	return { source: source.replace(LIBRARY_LINE, '').trim(), libraries };
}

function withLibraries(text: string, libraries: string[]): string {
	return libraries.reduce((at, library) => withLibrary(at, library).source, text);
}

function needPackages(dialect: ImageDialect, source: string, libraries: string[]): void {
	if (dialect !== 'latex') return;
	if (source.includes('\\begin{tikzpicture}')) ensurePackage(TIKZ);
	const env = /\\begin\{(align\*?|gather\*?|multline\*?)\}/.exec(source)?.[1];
	if (env) ensurePackage(amsmathFor(env));
	if (!libraries.length) return;
	const cm = activeCm();
	if (!cm) return void editPreambleHere.current?.((preamble) => withLibraries(preamble, libraries));
	const text = cm.state.doc.toString();
	const next = withLibraries(text, libraries);
	let from = 0;
	while (from < text.length && text[from] === next[from]) from++;
	const added = next.length - text.length;
	if (added > 0) cm.dispatch({ changes: { from, insert: next.slice(from, from + added) } });
}

/** a file that imports CeTZ already keeps its own import */
function withoutOwnImport(dialect: ImageDialect, source: string, text: string): string {
	return dialect === 'typst' && importsCetz(text) ? source.replace(`${CETZ_IMPORT}\n`, '').trimStart() : source;
}

async function placeIn(path: string | null, at: (text: string) => number): Promise<PreviewPlace | null> {
	const root = workspaceRoot.current;
	if (!path || !root) return null;
	const text = await textNow(path).catch(() => '');
	return { path, root, text, at: at(text) };
}

// the visual editor reads pasted source in the file's own language: so does a converted picture
function pasteSource(view: EditorView, source: string): void {
	const clipboard = new DataTransfer();
	clipboard.setData('text/plain', source);
	view.pasteText(source, new ClipboardEvent('paste', { clipboardData: clipboard }));
}

/** `after` is the end of the block holding the picture; null pastes at the caret */
export function visualImageTarget(view: EditorView, dialect: ImageDialect, after: number | null): ImageToLatexTarget {
	const path = activeFilePath.current;
	return {
		dialect,
		place: () => placeIn(path, (text) => text.length),
		insert(answer) {
			if (!view.dom.isConnected) return;
			const { source, libraries } = withoutLibraryLines(dialect, answer);
			if (after !== null) {
				const at = Math.min(after, view.state.doc.content.size);
				const tr = view.state.tr.insert(at, view.state.schema.nodes.paragraph.create());
				view.dispatch(tr.setSelection(TextSelection.create(tr.doc, at + 1)));
			}
			pasteSource(view, withoutOwnImport(dialect, source, view.state.doc.textContent));
			needPackages(dialect, source, libraries);
			view.focus();
		}
	};
}

/** `line` is the line the picture's command ends on; null replaces the selection */
export function sourceImageTarget(view: CMView, dialect: ImageDialect, line: number | null): ImageToLatexTarget {
	const path = activeFilePath.current;
	return {
		dialect,
		place: () => placeIn(path, () => (line === null ? view.state.selection.main.head : view.state.doc.line(line).to)),
		insert(answer) {
			if (!view.dom.isConnected) return;
			const { source: picture, libraries } = withoutLibraryLines(dialect, answer);
			const source = withoutOwnImport(dialect, picture, view.state.doc.toString());
			if (line === null) view.dispatch({ ...view.state.replaceSelection(source), userEvent: 'input.paste', scrollIntoView: true });
			else {
				const at = view.state.doc.line(Math.min(line, view.state.doc.lines)).to;
				view.dispatch({ changes: { from: at, insert: `\n\n${source}` }, userEvent: 'input.paste', scrollIntoView: true });
			}
			needPackages(dialect, source, libraries);
			view.focus();
		}
	};
}
