// hover tooltips: macro signature/doc, package/class blurb, full citation entry, glossary
// description, \ref target preview (rendered math when the label sits in a math environment,
// with the resolved number from the .aux), and an inline image preview for \includegraphics.
import { EditorView, hoverTooltip, type Tooltip } from '@codemirror/view';
import type { Extension } from '@codemirror/state';
import { convertLatexToMarkup } from 'mathlive';
import { referenceStore } from '$lib/stores/editorStore';
import { projectIntelStore } from '$lib/stores/projectIntel';
import { mathMacrosFor } from '$lib/editor/source/extensions/math-preview/userMacros';
import { docText } from '$lib/editor/source/docText';
import { firstExistingUrl } from '$lib/editor/visual/fileAccess';
import { catalogEntry } from '../knowledge/catalog';
import { GLOSSARY_ROLES, knownGlossary } from './completion/glossary';
import { macroLookup } from './completion/macros';
import { documentPackages, documentPackagesNow } from './packages/loadedPackages';
import { stackedCommands } from '../knowledge/stackedEntries';
import { loaderOpening, loadersOf } from './packages/loaderCommands';
import { callsIn, commandNames, rolesOf, type CommandReadings } from '../knowledge/calls/commandCalls';
import { loadedReadings } from '../knowledge/calls/loadedReadings';
import type { LoadedFile } from '../knowledge/loadedFiles';
import type { Role } from '../knowledge/types';
import { keysIn } from '../knowledge/calls/roleKeys';
import { blankUnread, codeOnly } from '../texCode';
import { commonEnvFacts, hasMathBody, holdsMath } from '$lib/languages/latex/knowledge/environments/envFacts';

export type Token = {
	kind: 'macro' | 'package' | 'class' | 'citekey' | 'label' | 'glosskey' | 'graphic';
	value: string;
	from: number;
	to: number;
};

type BracedFamily = { re: RegExp; kind: Token['kind']; whole?: true };

let dataFamilies: BracedFamily[] | null = null;

function fileFamilies(): BracedFamily[] {
	dataFamilies ??= [
		...loadersOf(['package', 'class']).map((loader) => ({
			re: new RegExp(`${loaderOpening(loader)}\\{([^{}]+)\\}`, 'g'),
			kind: loader.role as Token['kind'],
			...(loader.arg.list ? {} : { whole: true as const })
		})),
		{ re: new RegExp(`\\\\(?:${commandNames(['graphic']).join('|')})\\*?(?:\\[[^\\]]*\\])*\\{([^{}]+)\\}`, 'g'), kind: 'graphic' }
	];
	return dataFamilies;
}

// the item of an argument of `role` that `pos` is on, from the calls in the line
function roleTokenAt(
	lineText: string,
	lineStart: number,
	pos: number,
	role: Role | Role[],
	kind: Token['kind'],
	own?: CommandReadings
): Token | null {
	const roles = Array.isArray(role) ? role : [role];
	for (const call of callsIn(lineText, roles, own)) {
		for (const arg of call.args) {
			if (!rolesOf(arg.arg).some((r) => roles.includes(r)) || (kind !== 'label' && arg.arg.defines)) continue;
			for (const { value, at } of arg.values) {
				const from = lineStart + at;
				if (pos >= from && pos <= from + value.length) return { kind, value, from, to: from + value.length };
			}
		}
	}
	return null;
}

/** finds what the given position is "over" by pattern-matching within its line. shared with definition.ts. */
export function tokenAt(lineText: string, lineStart: number, pos: number, loaded?: LoadedFile[] | null): Token | null {
	const posInLine = pos - lineStart;

	const label = roleTokenAt(lineText, lineStart, pos, 'label', 'label');
	if (label) return label;

	const bracedFamilies: BracedFamily[] = [...fileFamilies()];
	for (const { re, kind, whole } of bracedFamilies) {
		for (const m of lineText.matchAll(re)) {
			const groupStart = lineStart + (m.index ?? 0) + m[0].indexOf(m[1]);
			const groupEnd = groupStart + m[1].length;
			if (pos < groupStart || pos > groupEnd) continue;
			// a package/citation list can have multiple comma-separated names; find which one
			const offsetInGroup = pos - groupStart;
			const parts = whole ? [m[1]] : m[1].split(',');
			let consumed = 0;
			for (const part of parts) {
				const partFrom = groupStart + consumed;
				const partTo = partFrom + part.length;
				if (offsetInGroup >= consumed && pos <= partTo) return { kind, value: part.trim(), from: partFrom, to: partTo };
				consumed += part.length + 1;
			}
		}
	}

	const cited = roleTokenAt(lineText, lineStart, pos, 'citekey', 'citekey');
	if (cited) return cited;
	const glossary = loaded
		? roleTokenAt(lineText, lineStart, pos, GLOSSARY_ROLES, 'glosskey', loadedReadings(loaded, GLOSSARY_ROLES))
		: null;
	if (glossary) return glossary;

	// \macroname — longest run of letters immediately after a backslash containing pos.
	// checked AFTER the braced families so hovering a key inside \ref{...} wins over \ref itself.
	for (const m of lineText.matchAll(/\\([a-zA-Z]+)/g)) {
		const from = lineStart + (m.index ?? 0);
		const to = from + m[0].length;
		if (posInLine >= (m.index ?? 0) && pos <= to) return { kind: 'macro', value: m[1], from, to };
	}
	return null;
}

function dom(html: string): HTMLElement {
	const div = document.createElement('div');
	div.className = 'cm-tooltip-latex-hover';
	div.innerHTML = html;
	return div;
}

function escapeHtml(s: string): string {
	return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
}

let labelOffsets: { text: string; byKey: Map<string, number> } | null = null;

/** the buffer offset of \label{name}'s definition, or null if not found. shared with definition.ts. */
export function findLabelOffset(fullText: string, name: string): number | null {
	if (!fullText.includes(name)) return null;
	if (labelOffsets?.text !== fullText) {
		const byKey = new Map<string, number>();
		for (const d of keysIn(codeOnly(fullText), 'label', true)) if (!byKey.has(d.key)) byKey.set(d.key, d.call.at);
		labelOffsets = { text: fullText, byKey };
	}
	return labelOffsets.byKey.get(name) ?? null;
}

function withoutLabels(context: string): string {
	let out = '';
	let from = 0;
	for (const { call } of keysIn(codeOnly(context), 'label', true)) {
		out += context.slice(from, call.at);
		from = call.end;
	}
	return out + context.slice(from);
}

const BEGIN_ENV = /\\begin\{([^{}]+)\}/g;

// the whole math environment enclosing `idx`, so hover renders the full equation instead of a
// ±1-line window (which clipped multi-line aligns and over-included neighbours)
function enclosingMathEnv(text: string, idx: number): string | null {
	for (const m of text.matchAll(BEGIN_ENV)) {
		if (m.index >= idx) break;
		if (!hasMathBody(commonEnvFacts(m[1]))) continue;
		const closer = `\\end{${m[1]}}`;
		const end = text.indexOf(closer, m.index);
		if (end === -1 || end < idx) continue;
		const slice = text.slice(m.index, end + closer.length);
		return slice.length <= 2000 ? slice : null;
	}
	return null;
}

function labelPreview(name: string, sourceText: string): { html: string; from?: string } | null {
	const intel = projectIntelStore.current;
	const number = intel.auxNumbers[name];
	const heading = number ? `<div class="text-xs opacity-70">(${escapeHtml(number)})</div>` : '';

	let context: string | null = null;
	let from: string | undefined;
	const idx = findLabelOffset(sourceText, name);
	if (idx != null) {
		context = enclosingMathEnv(sourceText, idx);
		if (!context) {
			const lineNo = sourceText.slice(0, idx).split('\n').length - 1;
			context = sourceText
				.split('\n')
				.slice(Math.max(0, lineNo - 1), lineNo + 2)
				.join('\n');
		}
	} else {
		const remote = intel.labels.find((l) => l.name === name);
		if (remote) {
			context = remote.context;
			from = remote.file.replace(/\\/g, '/').split('/').pop();
		}
	}
	if (!context) return number ? { html: heading } : null;

	const looksMath = [...context.matchAll(BEGIN_ENV)].some((m) => holdsMath(commonEnvFacts(m[1])));
	if (looksMath) {
		try {
			const cleaned = withoutLabels(context);
			return {
				html: heading + convertLatexToMarkup(cleaned, { defaultMode: 'math', macros: mathMacrosFor(sourceText) }),
				from
			};
		} catch {
			/* fall through to plain text */
		}
	}
	return { html: heading + `<pre>${escapeHtml(context)}</pre>`, from };
}

const ARGUMENT_SHAPE = /^(?:\[\]|\{\}|\(\)|<>|\*)+$/;

/** detail is a shape ({text}), a form (\left( ... \right)), what the command prints or prose; only a shape joins the name */
export function hoverCode(name: string, detail: string, prints: string | undefined): { code: string; note: string } {
	const glyph = prints !== undefined && detail === prints;
	const isForm = !glyph && detail.startsWith('\\');
	const isShape = !glyph && ARGUMENT_SHAPE.test(detail);
	return { code: isForm ? detail : `\\${name}${isShape ? detail : ''}`, note: isForm || isShape ? '' : detail };
}

async function macroHover(view: EditorView, token: Token, at: { pos: number; end: number; above: boolean }): Promise<Tooltip | null> {
	const text = docText(view.state.doc);
	const found = await macroLookup(text, token.value);
	if (!found) return null; // unrecognized macro: no hover, matching LaTeX Workshop
	const prints = stackedCommands(await documentPackages(text)).get(token.value)?.prints ?? undefined;
	const { code, note } = hoverCode(token.value, found.detail ?? '', prints);
	const notes = [note, found.info ?? '']
		.filter(Boolean)
		.map((t) => `<div class="text-xs opacity-80">${escapeHtml(t)}</div>`)
		.join('');
	return { ...at, create: () => ({ dom: dom(`<code>${escapeHtml(code)}</code>${notes}`) }) };
}

async function glossaryHover(view: EditorView, token: Token, at: { pos: number; end: number; above: boolean }): Promise<Tooltip | null> {
	const text = docText(view.state.doc);
	const entry = (await knownGlossary(text, await documentPackages(text))).get(token.value);
	if (!entry?.description) return null;
	return { ...at, create: () => ({ dom: dom(`<b>${escapeHtml(token.value)}</b><br>${escapeHtml(entry.description)}`) }) };
}

async function graphicHover(relPath: string, at: { pos: number; end: number; above: boolean }): Promise<Tooltip | null> {
	const url = await firstExistingUrl(graphicUrls(relPath));
	if (!url) return null;
	return {
		...at,
		create: () => {
			const div = dom('');
			const img = div.appendChild(document.createElement('img'));
			img.style.maxWidth = '320px';
			img.style.maxHeight = '240px';
			img.src = url;
			return { dom: div };
		}
	};
}

const CITE_FIELDS = ['author', 'title', 'journal', 'journaltitle', 'booktitle', 'publisher', 'year', 'date', 'doi', 'url'] as const;

/** hover tooltip provider for macros, packages/classes, citations, glossary keys, refs, graphics. */
export function latexHover(): Extension {
	return [
		hoverTooltip((view, pos): Tooltip | null | Promise<Tooltip | null> => {
			const text = docText(view.state.doc);
			const now = documentPackagesNow(text);
			return now ? hoverAt(view, pos, now) : documentPackages(text).then((loaded) => hoverAt(view, pos, loaded));
		})
	];
}

function hoverAt(view: EditorView, pos: number, loaded: LoadedFile[]): Tooltip | null | Promise<Tooltip | null> {
	const line = view.state.doc.lineAt(pos);
	const token = tokenAt(blankUnread(line.text), line.from, pos, loaded);
	if (!token) return null;
	const at = { pos: token.from, end: token.to, above: true };

	if (token.kind === 'macro') return macroHover(view, token, at);
	if (token.kind === 'package' || token.kind === 'class') {
		const pkgInfo = catalogEntry(`${token.kind === 'package' ? 'packages' : 'classes'}/${token.value}`);
		if (!pkgInfo?.about && !pkgInfo?.url) return null;
		const parts = [
			`<b>${escapeHtml(token.value)}</b>`,
			pkgInfo.about ? escapeHtml(pkgInfo.about) : '',
			pkgInfo.url ? `<span class="text-xs opacity-70">${escapeHtml(pkgInfo.url)}</span>` : ''
		].filter(Boolean);
		return { ...at, create: () => ({ dom: dom(parts.join('<br>')) }) };
	}
	if (token.kind === 'citekey') {
		const ref = (referenceStore.current ?? []).find((r) => r.key === token.value);
		if (!ref) return null;
		const rows = CITE_FIELDS.map((f) => [f, ref[f]] as const)
			.filter(([, v]) => typeof v === 'string' && v)
			.map(([f, v]) => `<div><span class="opacity-60">${f}:</span> ${escapeHtml(String(v))}</div>`);
		if (!rows.length) return null;
		return { ...at, create: () => ({ dom: dom(`<b>${escapeHtml(ref.key)}</b>${rows.join('')}`) }) };
	}
	if (token.kind === 'glosskey') return glossaryHover(view, token, at);
	if (token.kind === 'label') {
		const preview = labelPreview(token.value, docText(view.state.doc));
		if (!preview) return null;
		const suffix = preview.from ? `<div class="text-xs opacity-60">${escapeHtml(preview.from)}</div>` : '';
		return { ...at, create: () => ({ dom: dom(preview.html + suffix) }) };
	}
	if (token.kind === 'graphic') return graphicHover(token.value, at);
	return null;
}

// resolved lazily so this module stays importable outside Electron (tests)
let resolveGraphic: ((relPath: string) => string[]) | null = null;

/** the workspace wires image-path resolution here: candidate URLs tried in order (the img's
 * onerror advances), covering current-dir/root bases and extension-less \includegraphics. */
export function setGraphicResolver(resolver: ((relPath: string) => string[]) | null) {
	resolveGraphic = resolver;
}

function graphicUrls(relPath: string): string[] {
	if (!/\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(relPath) && /\.[a-z]+$/i.test(relPath)) return []; // pdf/eps: no thumbnail
	return resolveGraphic?.(relPath) ?? [];
}
