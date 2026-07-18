// hover tooltips: macro signature/doc, package/class blurb, full citation entry, glossary
// description, \ref target preview (rendered math when the label sits in a math environment,
// with the resolved number from the .aux), and an inline image preview for \includegraphics.
import { hoverTooltip, type Tooltip } from '@codemirror/view';
import { get } from 'svelte/store';
import type { Extension } from '@codemirror/state';
import { convertLatexToMarkup } from 'mathlive';
import { referenceStore } from '$lib/stores/editorStore';
import { projectIntelStore } from '$lib/stores/projectIntel';
import { mathMacrosFor } from '$lib/editor/extensions/math-preview/userMacros';
import { CLASS_NAMES } from './data/classnames';
import { PACKAGE_NAMES } from './data/packagenames';
import { macroLookup } from './completion/macros';

const CLASS_INFO = new Map(CLASS_NAMES.map((c) => [c.name, c]));
const PACKAGE_INFO = new Map(PACKAGE_NAMES.map((p) => [p.name, p]));

export interface Token {
	kind: 'macro' | 'package' | 'class' | 'citekey' | 'label' | 'glosskey' | 'graphic';
	value: string;
	from: number;
	to: number;
}

/** finds what the given position is "over" by pattern-matching within its line. shared with definition.ts. */
export function tokenAt(lineText: string, lineStart: number, pos: number): Token | null {
	const posInLine = pos - lineStart;

	const bracedFamilies: { re: RegExp; kind: Token['kind'] }[] = [
		{ re: /\\(?:usepackage|RequirePackage)(?:\[[^\]]*\])?\{([^{}]+)\}/g, kind: 'package' },
		{ re: /\\documentclass(?:\[[^\]]*\])?\{([^{}]+)\}/g, kind: 'class' },
		{ re: /\\[a-zA-Z]*[Cc]ite[a-zA-Z]*\*?(?:\[[^\]]*\])*\{([^{}]+)\}/g, kind: 'citekey' },
		{ re: /\\[a-zA-Z]*ref[a-zA-Z]*\*?\{([^{}]+)\}/g, kind: 'label' },
		{ re: /\\label\{([^{}]+)\}/g, kind: 'label' },
		{
			re: /\\(?:gls(?:pl|text|first|name|symbol|desc|disp)?|Gls(?:pl)?|Acr(?:long|full|short)?(?:pl)?|ac[slf]?p?)\{([^{}]+)\}/gi,
			kind: 'glosskey'
		},
		{ re: /\\(?:adj)?includegraphics\*?(?:\[[^\]]*\])*\{([^{}]+)\}/g, kind: 'graphic' }
	];
	for (const { re, kind } of bracedFamilies) {
		for (const m of lineText.matchAll(re)) {
			const groupStart = lineStart + (m.index ?? 0) + m[0].indexOf(m[1]);
			const groupEnd = groupStart + m[1].length;
			if (pos < groupStart || pos > groupEnd) continue;
			// a package/citation list can have multiple comma-separated names; find which one
			const offsetInGroup = pos - groupStart;
			const parts = m[1].split(',');
			let consumed = 0;
			for (const part of parts) {
				const partFrom = groupStart + consumed;
				const partTo = partFrom + part.length;
				if (offsetInGroup >= consumed && pos <= partTo) return { kind, value: part.trim(), from: partFrom, to: partTo };
				consumed += part.length + 1;
			}
		}
	}

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

/** the buffer offset of \label{name}'s definition, or null if not found. shared with definition.ts. */
export function findLabelOffset(fullText: string, name: string): number | null {
	const re = new RegExp(`\\\\label\\{${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\}`);
	const idx = fullText.search(re);
	return idx < 0 ? null : idx;
}

const MATH_ENV_RE = /\\begin\{(equation|align|alignat|flalign|gather|multline|eqnarray|math|displaymath)(\*?)\}/g;

// the whole math environment enclosing `idx`, so hover renders the full equation instead of a
// ±1-line window (which clipped multi-line aligns and over-included neighbours)
function enclosingMathEnv(text: string, idx: number): string | null {
	MATH_ENV_RE.lastIndex = 0;
	for (let m = MATH_ENV_RE.exec(text); m && m.index < idx; m = MATH_ENV_RE.exec(text)) {
		const end = text.indexOf(`\\end{${m[1]}${m[2]}}`, m.index);
		if (end === -1 || end < idx) continue;
		const slice = text.slice(m.index, end + `\\end{${m[1]}${m[2]}}`.length);
		return slice.length <= 2000 ? slice : null;
	}
	return null;
}

function labelPreview(name: string, sourceText: string): { html: string; from?: string } | null {
	const intel = get(projectIntelStore);
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

	const looksMath = /\\begin\{(align|alignat|equation|gather|multline|eqnarray|math|displaymath)/.test(context);
	if (looksMath) {
		try {
			const cleaned = context.replace(/\\label\{[^{}]*\}/g, '');
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

const CITE_FIELDS = ['author', 'title', 'journal', 'journaltitle', 'booktitle', 'publisher', 'year', 'date', 'doi', 'url'] as const;

/** hover tooltip provider for macros, packages/classes, citations, glossary keys, refs, graphics. */
export function latexHover(): Extension {
	return hoverTooltip((view, pos): Tooltip | null => {
		const line = view.state.doc.lineAt(pos);
		const token = tokenAt(line.text, line.from, pos);
		if (!token) return null;
		const at = { pos: token.from, end: token.to, above: true };

		if (token.kind === 'macro') {
			const found = macroLookup(view.state.doc.toString(), token.value);
			if (!found) return null; // unrecognized macro: no hover, matching LaTeX Workshop
			const shape = found.detail ?? '';
			const doc = found.info ? `<div class="text-xs opacity-80">${escapeHtml(found.info)}</div>` : '';
			return { ...at, create: () => ({ dom: dom(`<code>\\${escapeHtml(token.value)}${escapeHtml(shape)}</code>${doc}`) }) };
		}
		if (token.kind === 'package' || token.kind === 'class') {
			const info = (token.kind === 'package' ? PACKAGE_INFO : CLASS_INFO).get(token.value);
			if (!info?.detail && !info?.url) return null;
			const parts = [
				`<b>${escapeHtml(token.value)}</b>`,
				info.detail ? escapeHtml(info.detail) : '',
				info.url ? `<span class="text-xs opacity-70">${escapeHtml(info.url)}</span>` : ''
			].filter(Boolean);
			return { ...at, create: () => ({ dom: dom(parts.join('<br>')) }) };
		}
		if (token.kind === 'citekey') {
			const ref = (get(referenceStore) ?? []).find((r) => r.key === token.value);
			if (!ref) return null;
			const rows = CITE_FIELDS.map((f) => [f, ref[f]] as const)
				.filter(([, v]) => typeof v === 'string' && v)
				.map(([f, v]) => `<div><span class="opacity-60">${f}:</span> ${escapeHtml(String(v))}</div>`);
			if (!rows.length) return null;
			return { ...at, create: () => ({ dom: dom(`<b>${escapeHtml(ref.key)}</b>${rows.join('')}`) }) };
		}
		if (token.kind === 'glosskey') {
			const entry = get(projectIntelStore).glossary.find((g) => g.key === token.value);
			if (!entry?.description) return null;
			return { ...at, create: () => ({ dom: dom(escapeHtml(entry.description)) }) };
		}
		if (token.kind === 'label') {
			const preview = labelPreview(token.value, view.state.doc.toString());
			if (!preview) return null;
			const suffix = preview.from ? `<div class="text-xs opacity-60">${escapeHtml(preview.from)}</div>` : '';
			return { ...at, create: () => ({ dom: dom(preview.html + suffix) }) };
		}
		if (token.kind === 'graphic') {
			const urls = graphicUrls(token.value);
			if (!urls.length) return null;
			return {
				...at,
				create: () => {
					const div = dom('');
					const img = div.appendChild(document.createElement('img'));
					img.style.maxWidth = '320px';
					img.style.maxHeight = '240px';
					let i = 0;
					img.onerror = () => (i < urls.length - 1 ? (img.src = urls[++i]) : div.remove());
					img.src = urls[0];
					return { dom: div };
				}
			};
		}
		return null;
	});
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
