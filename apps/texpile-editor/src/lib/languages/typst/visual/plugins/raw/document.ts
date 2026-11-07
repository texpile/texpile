import type { Node } from 'prosemirror-model';
import { typStr, type TypstDocumentPlugin, type TypstRun, type TypstRunCore } from '$lib/languages/typst/visual/core/document';
import { fenceBlock, fenceSeg, inlineRaw, rawCall } from './rawImport';

// the language picker's names, as the tokens typst's highlighter knows them by
const RAW_LANGS: Record<string, string> = { 'c++': 'cpp', 'c#': 'cs', 'f#': 'fs' };

// typst reads a raw block's language as one word of letters, digits, `-` and `_`, the rest of its line as code
function rawLang(infoString: string): string {
	return RAW_LANGS[infoString.toLowerCase()] ?? infoString.replace(/[^\p{L}\p{N}_-]+/gu, '-');
}

/** inline raw. typst has no two-backtick form and the three-backtick one takes a language word,
 *  so a backtick inside the text goes through the function form */
function codeSpan(text: string): string {
	return text.includes('`') ? `#raw(${typStr(text)})` : '`' + text + '`';
}

/** a one-line raw the file wrote with three backticks, in its fences and language again */
function fencedSpan(node: Node, text: string): string | null {
	const fence = node.marks.find((m) => m.type.name === 'code')?.attrs.typRaw as { open?: unknown; close?: unknown } | null;
	if (!fence || typeof fence.open !== 'string' || typeof fence.close !== 'string' || /`|\n/.test(text)) return null;
	return fence.open + text + fence.close;
}

function codeRun(node: Node, run: TypstRunCore): TypstRun | null {
	if (!node.marks.some((m) => m.type.name === 'code')) return null;
	const code = run.shadowed(node, node.text ?? '');
	return { content: fencedSpan(node, code) ?? codeSpan(code), marks: run.marks(node.marks), kind: 'other' };
}

function isCodeBlock(node: Node): boolean {
	return node.type.name === 'code_block';
}

export const rawDocument: TypstDocumentPlugin = {
	import: {
		markup: { blocks: { Raw: fenceSeg }, inline: { Raw: inlineRaw }, code: { Raw: fenceBlock } },
		calls: { inline: { raw: rawCall } }
	},
	// overrides build NEW spec objects, since mutating the imported literals would leak into every dialect
	// a code block created without attrs (shared toolbar button, keybind) must be a FENCE here, not
	// tex's verbatim: typst raw fences take an info string, so the language picker works everywhere
	// Spread the base attrs first: replacing them wholesale silently drops the ones the shared
	// extensions read. typRaw: the fences and language of a one-line raw written with three backticks
	// (```` ```rust x``` ````)
	schema: ({ nodes, marks }) => {
		const block = nodes.get('code_block')!;
		const code = marks.get('code')!;
		const blockAttrs = { ...block.attrs, lang: { default: '' }, env: { default: 'fence' }, args: { default: '' } };
		return {
			nodes: nodes.update('code_block', { ...block, attrs: blockAttrs }),
			marks: marks.update('code', { ...code, attrs: { ...code.attrs, typRaw: { default: null } } })
		};
	},
	save: {
		nodes: {
			code_block(node) {
				const infoString = rawLang(String(node.attrs.args ?? '').trim());
				const content = node.textContent;
				const runs = content.match(/`{3,}/g);
				const fence = '`'.repeat(runs ? Math.max(3, ...runs.map((r) => r.length)) + 1 : 3);
				return `${fence}${infoString}\n${content}\n${fence}\n\n`;
			}
		},
		text: codeRun,
		// inline raw sits between backticks or in the string of a #raw call
		leaf: (leaf, text) => (leaf.marks.some((m) => m.type.name === 'code') ? (/[`"\\]/.test(text) ? null : text) : undefined),
		wholeRun: isCodeBlock,
		ownLines: isCodeBlock
	}
};
