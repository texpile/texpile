// Markdown text, what an AI chat's copy button gives, pastes as the formatting it spells out. The
// gate is conservative: prose with a stray asterisk stays prose.
import { DOMParser as PMDOMParser, DOMSerializer, Slice, type Schema } from 'prosemirror-model';
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
