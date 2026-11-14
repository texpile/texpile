// Markdown text, what an AI chat's copy button gives, pastes as the formatting it spells out. The
// gate is conservative: prose with a stray asterisk or a price stays prose.
import { DOMParser as PMDOMParser, DOMSerializer, Slice, type Schema } from 'prosemirror-model';
import { closesInOneLine, escapedAt, inlineMathEnd } from '$lib/languages/markdown/syntax/mathSyntax';
import { markdownToProseMirror } from '$lib/languages/markdown/visual/converter';
import { mdSchema } from '$lib/languages/markdown/visual/schema';
import type { PasteDialect } from './pastedImages';
import { convertPastedMath, schemaMathSyntax } from './pastedMath';
import { convertPastedRawBlocks, markCopiedRawLanguages } from './pastedRawBlocks';

// what only Markdown writes: Typst reads code, raw blocks and `-` lists the same way
// (not `2**10`, `__init__`, a `>>>` prompt or `handlers[name](event)`, which are code)
const MARKDOWN_ONLY = [
	/^\s{0,3}> \S/m,
	/(?<![\p{L}\p{N}])\*\*[^*\s][^*\n]*\*\*/u,
	/(^|\W)__[^_\s][^_\n]*\s[^_\n]*__(\W|$)/,
	/!?\[[^\]\n]+\]\((?:(?:[a-z][a-z0-9+.-]*:|\.{0,2}\/|#)[^)\s]*|[^)\s]*\.\w+)\)/i,
	/^\|.*\|\s*\n\|?\s*:?-{3,}/m
];
const HEADING = /^#{1,6}\s+\S/;
// a `#` line above code is a comment, not a heading
const CODE_LINE = /[=;{}]|\w\(/;
const SHARED_WITH_TYPST = [/^```/m, /`[^`\n]+`/];
const TEX_QUOTES = /``[^`\n]*''/g;
const LIST_LINE = /^\s{0,3}([-*+]|\d{1,3}[.)])\s+\S/;
const TYPST_ONLY = [/^\s*=+\s+\S/m, /#[a-zA-Z][\w-]*[([]/, /^\s*\+\s+\S/m, /^\s*\/\s+[^:\n]+:/m];
// math and code are where a Markdown answer holds its backslashes
const MATH_AND_CODE = /```[\s\S]*?```|`[^`\n]*`|\$\$[\s\S]*?\$\$|\$[^$\n]+\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)/g;

const DISPLAY_FENCE = /^\s{0,3}(\$\$|\\\[)/;
const CODE_SPANS = /```[\s\S]*?```|`[^`\n]*`/g;
// a formula says so by a command, a script or a simple relation: `$HOME/$USER` and `$(a); b=$(c)` are shell
const MATH_LIKE = /\\[a-zA-Z]|[\^_]|^[A-Za-z]$|^[A-Za-z0-9.]+ [=<>] [A-Za-z0-9.]+$/;

function hasDisplayMath(text: string): boolean {
	const lines = text.split('\n');
	return lines.some((line, i) => {
		const open = DISPLAY_FENCE.exec(line)?.[1];
		if (!open) return false;
		const rest = line.trim().slice(2);
		const close = open === '$$' ? '$$' : '\\]';
		if (open === '$$' ? closesInOneLine(rest) : rest.length > 2 && rest.endsWith(close)) return true;
		for (const next of lines.slice(i + 1)) {
			if (!next.trim()) return false;
			if (next.trimEnd().endsWith(close)) return true;
		}
		return false;
	});
}

function hasInlineMath(text: string): boolean {
	if (/(?<!\\)\\\([^\n]+?\\\)/.test(text)) return true;
	for (let at = text.indexOf('$'); at >= 0; at = text.indexOf('$', at + 1)) {
		if (escapedAt(text, at)) continue;
		const end = inlineMathEnd(text, at);
		if (end > 0 && MATH_LIKE.test(text.slice(at, end).replace(/^\$+|\$+$/g, ''))) return true;
	}
	return false;
}

function hasListRun(text: string): boolean {
	const lines = text.split('\n');
	return lines.some((line, i) => LIST_LINE.test(line) && LIST_LINE.test(lines[i + 1] ?? ''));
}

function hasHeading(text: string): boolean {
	const lines = text.split('\n');
	return lines.some((line, i) => HEADING.test(line) && !CODE_LINE.test(lines[i + 1] ?? ''));
}

/** true when `text` reads as Markdown in an editor of `dialect`, rather than as that dialect's own source or plain prose */
export function looksLikeMarkdown(text: string, dialect: PasteDialect): boolean {
	if (dialect === 'typst' && TYPST_ONLY.some((re) => re.test(text))) return false;
	if (dialect === 'latex' && /\\[a-zA-Z]{2,}/.test(text.replace(MATH_AND_CODE, ''))) return false;
	if (hasHeading(text) || MARKDOWN_ONLY.some((re) => re.test(text))) return true;
	// Typst writes `$x$` itself; `$$` and `\[` lines are what a chat answer writes
	const prose = text.replace(CODE_SPANS, '');
	if (dialect !== 'latex' && (hasDisplayMath(prose) || (dialect === 'markdown' && hasInlineMath(prose)))) return true;
	const code = text.replace(TEX_QUOTES, '');
	return dialect !== 'typst' && (SHARED_WITH_TYPST.some((re) => re.test(code)) || hasListRun(text));
}

/** `text` parsed as Markdown into nodes of `schema`, through HTML when the editor is not the Markdown one */
export function markdownSlice(text: string, schema: Schema): Slice | null {
	const { doc } = markdownToProseMirror(text);
	if (!doc.childCount) return null;
	// a table cell is not opened into, so the text after the caret stays out of the last cell
	if (schema === mdSchema) return Slice.maxOpen(doc.content, false);
	const dom = document.createElement('div');
	dom.append(DOMSerializer.fromSchema(mdSchema).serializeFragment(doc.content));
	markCopiedRawLanguages(doc.content, dom);
	convertPastedRawBlocks(dom, schemaMathSyntax(schema));
	convertPastedMath(dom, schemaMathSyntax(schema));
	return Slice.maxOpen(PMDOMParser.fromSchema(schema).parseSlice(dom).content, false);
}
