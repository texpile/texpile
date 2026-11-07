import type { Node } from 'prosemirror-model';
import type { LatexNodeSave, LatexSaveCore } from '$lib/languages/latex/visual/core/document';

export const SLIDE_BLOCKS = ['frame', 'beamer_block', 'columns'];

function headerOf(node: Node): string {
	const parts: unknown[] = [];
	node.forEach((child) => {
		const argument =
			child.type.name === 'beamer_block_title' || (child.attrs.form === 'arg' && /^frame_(sub)?title$/.test(child.type.name));
		if (argument) parts.push(child.toJSON());
	});
	return JSON.stringify(parts);
}

export function slideHeaderHolds(node: Node, parsed: Node): boolean {
	return !SLIDE_BLOCKS.includes(node.type.name) || headerOf(node) === headerOf(parsed);
}

function childOfType(node: Node, type: string): Node | null {
	let found: Node | null = null;
	node.forEach((child) => {
		if (child.type.name === type) found = child;
	});
	return found;
}

function textOf(core: LatexSaveCore, node: Node | null): string {
	return node ? core.children(node, false).trim() : '';
}

export const SLIDE_SAVES: Record<string, LatexNodeSave> = {
	frame(node, _ctx, core) {
		const title = childOfType(node, 'frame_title');
		const subtitle = childOfType(node, 'frame_subtitle');
		const options = String(node.attrs.options ?? '');
		const body = core.body(node);
		if (node.attrs.form === 'macro') {
			const single = !body.trimEnd().includes('\n');
			return single ? `\\frame${options}{${body.trimEnd()}}\n` : `\\frame${options}{\n${body}}\n`;
		}
		const subtitleArg = subtitle?.attrs.form === 'arg';
		const titleArg = title?.attrs.form === 'arg';
		const titleArguments = subtitleArg
			? `{${titleArg ? textOf(core, title) : ''}}{${textOf(core, subtitle)}}`
			: titleArg
				? `{${textOf(core, title)}}`
				: '';
		return `\\begin{frame}${options}${titleArguments}\n${body}\\end{frame}\n`;
	},

	frame_title: (node, _ctx, core) => (node.attrs.form === 'macro' ? `\\frametitle${node.attrs.spec}{${textOf(core, node)}}\n` : ''),
	frame_subtitle: (node, _ctx, core) => (node.attrs.form === 'macro' ? `\\framesubtitle${node.attrs.spec}{${textOf(core, node)}}\n` : ''),

	beamer_block(node, _ctx, core) {
		const kind = String(node.attrs.kind ?? 'block');
		return `\\begin{${kind}}${node.attrs.spec ?? ''}{${textOf(core, node.firstChild)}}\n${core.body(node)}\\end{${kind}}\n`;
	},
	beamer_block_title: () => '',

	columns: (node, _ctx, core) => `\\begin{columns}${node.attrs.options ?? ''}\n${core.body(node)}\\end{columns}\n`,
	column(node, _ctx, core) {
		const head = `${node.attrs.options ?? ''}{${node.attrs.width ?? ''}}`;
		const body = core.body(node);
		return node.attrs.form === 'env' ? `\\begin{column}${head}\n${body}\\end{column}\n` : `\\column${head}\n${body}`;
	}
};
