// loaded into the page by lineParity.spec: a parsed document laid out by the engine alone, its element trees from each
// node's toDOM, styled by the core base under the page's theme tokens; the line ranges of every textblock it lays out
import '../../../src/app.css';
import type { Node as PMNode } from 'prosemirror-model';
import { FaceElement, FaceText, faceElement, renderFaceSpec, type LayoutBox, type PositionMap } from '$lib/editor/canvas';
import { layoutBlock } from '$lib/editor/canvas/layout/layoutElement';
import type { DocumentHyphenation } from '$lib/editor/canvas/layout/linebreak/documentHyphenationLanguage';
import { ViewLineBreaking } from '$lib/editor/canvas/layout/linebreak/viewBreaking';
import { windowFontMetrics } from '$lib/editor/canvas/layout/text/fontMetrics';
import { windowTextMeasure } from '$lib/editor/canvas/layout/text/textMeasure';
import { createStyleBase } from '$lib/editor/canvas/style/base/styleBase';
import { CanvasStyleResolver } from '$lib/editor/canvas/style/canvasStyles';
import { ThemeTokens } from '$lib/editor/canvas/style/theme/themeTokens';

/** plain: text alone, no inline node */
export type EngineTextblock = {
	pos: number;
	type: string;
	text: string;
	plain: boolean;
	width: number;
	lines: { from: number; to: number; baseline: number }[];
};

class TreePositions implements PositionMap {
	readonly offsets = new Map<FaceElement, number>();
	readonly starts = new Map<number, FaceElement>();
	readonly holes = new Map<FaceElement, number>();
	posOf(element: FaceElement): number | null {
		return this.offsets.get(element) ?? null;
	}
	elementAt(offset: number): FaceElement | null {
		return this.starts.get(offset) ?? null;
	}
	contentStart(element: FaceElement): number | null {
		return this.holes.get(element) ?? null;
	}
}

function outerOf(node: PMNode): { dom: FaceElement; hole: FaceElement | null } {
	try {
		const spec = node.type.spec.toDOM?.(node);
		const { dom, contentDOM } = spec ? renderFaceSpec(spec) : { dom: null, contentDOM: null };
		if (dom instanceof FaceElement) return { dom, hole: contentDOM };
	} catch {
		// a toDOM that builds real DOM: its face comes with the face packages
	}
	const dom = faceElement(node.isInline ? 'span' : 'div', `pm-${node.type.name}`);
	if (!node.isLeaf) dom.hole = true;
	return { dom, hole: node.isLeaf ? null : dom };
}

type TreeNode = { node: PMNode; getPos: () => number; parent: PMNode | null };

function treeOf(top: PMNode, pos: number, nodes: Map<FaceElement, TreeNode>): { root: FaceElement; positions: TreePositions } {
	const positions = new TreePositions();
	function build(node: PMNode, offset: number, parent: PMNode | null): FaceElement {
		const { dom, hole } = outerOf(node);
		nodes.set(dom, { node, getPos: () => pos + offset, parent });
		positions.offsets.set(dom, offset);
		positions.starts.set(offset, dom);
		if (!hole) return dom;
		positions.holes.set(hole, offset + 1);
		if (node.inlineContent && node.content.size) hole.appendChild(new FaceText('​'));
		node.forEach((child, childOffset) => {
			if (!child.isText) hole.appendChild(build(child, offset + 1 + childOffset, node));
		});
		return dom;
	}
	return { root: build(top, 0, null), positions };
}

function collect(box: LayoutBox, blockPos: number, found: EngineTextblock[]): void {
	if (box.lines && box.node?.node.isTextblock) {
		const pos = blockPos + box.node.offset;
		found.push({
			pos,
			type: box.node.node.type.name,
			text: box.node.node.textContent,
			plain: box.node.node.content.content.every((child) => child.isText),
			width: box.width,
			lines: box.lines.map((line) => ({ from: blockPos + line.from, to: blockPos + line.to, baseline: line.baseline }))
		});
	}
	for (const child of box.children) collect(child, blockPos, found);
	for (const line of box.lines ?? [])
		for (const fragment of line.fragments) if (fragment.kind === 'atomic') collect(fragment.box, blockPos, found);
}

/** rootClass: the editor root's classes as P0 recorded them; width: the column's content width */
export async function engineTextblocks(
	doc: PMNode,
	rootClass: string,
	width: number,
	language: DocumentHyphenation
): Promise<EngineTextblock[]> {
	// as the app's index.html: the bundled theme gives the editor its font and text scaling
	document.documentElement.dataset.theme = 'theme';
	document.documentElement.dataset.mode = 'light';
	const root = document.body.appendChild(document.createElement('div'));
	root.className = rootClass;
	root.style.width = `${width}px`;
	await document.fonts.ready;
	const nodes = new Map<FaceElement, TreeNode>();
	const blocks: { node: PMNode; pos: number; tree: ReturnType<typeof treeOf> }[] = [];
	doc.forEach((node, pos) => blocks.push({ node, pos, tree: treeOf(node, pos, nodes) }));
	const tokens = new ThemeTokens(root);
	const editor = /Markdown/.test(rootClass) ? 'markdown' : /Typst/.test(rootClass) ? 'typst' : 'latex';
	const settings = { language: editor, pageView: false, readOnly: false, viewportWidth: innerWidth, editorFont: null } as const;
	const styles = new CanvasStyleResolver({
		base: createStyleBase({ nodeOf: (el) => nodes.get(el) ?? null, doc: () => doc }, () => settings),
		tokens: tokens.declaredText,
		remPx: () => tokens.remPx()
	});
	const breaking = new ViewLineBreaking(() => language);
	await breaking.patternsLoading();
	const tools = { measure: windowTextMeasure(), metrics: windowFontMetrics() };
	const faceSettings = { justify: true, hyphenate: true, showCaptions: true, imageDirectory: '', cropFormat: '', isMainFile: true };
	const found: EngineTextblock[] = [];
	for (const block of blocks) {
		const layout = layoutBlock(
			{
				node: block.node,
				pos: block.pos,
				root: block.tree.root,
				positions: block.tree.positions,
				widgets: new Map(),
				width,
				styles,
				decorations: { inline: [], nodes: new Map(), widgets: [] },
				breaking,
				settings: faceSettings,
				pixelRatio: window.devicePixelRatio
			},
			tools
		);
		collect(layout.box, block.pos, found);
	}
	return found;
}
