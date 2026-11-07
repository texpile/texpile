// Typst markup drawn as the visual editor draws a file of it
import { DOMSerializer, type DOMOutputSpec, type Node } from 'prosemirror-model';
import { blockSpanOf } from '$lib/editor/visual/sourceSpans';
import type { ChipFace, ChipFaceMaker } from '$lib/editor/visual/extensions/drawnChips/chipFace';
import { renderStaticMath } from '$lib/editor/visual/extensions/mathlivebridge/mathStatic';
import { typstToProseMirror } from '../../convert/converter';
import { typSchema } from '../../schema';
import { typstScopeOfDrawing } from '../scope/fileScopeNow.svelte';
import type { MarkupDrawing } from '../parts/drawingFace';
import { imageNodeFace } from '../parts/imageDrawing';

class Undrawn extends Error {}

const QUIET = 'drawn-typst-quiet';
const UNDRAWN = ['table', 'table_wrapper', 'includedoc', 'typ_figure', 'typ_grid', 'code_block'];

class MarkupFaces {
	faces: ChipFace[] = [];
	line = false;

	constructor(
		private markup: string,
		private drawChip: ChipFaceMaker,
		private lone: boolean
	) {}

	private kept(face: ChipFace, line: boolean): HTMLElement {
		this.faces.push(face);
		if (face.line || line) this.line = true;
		return face.dom;
	}

	chip(node: Node): HTMLElement {
		const face = this.drawChip(node.textContent);
		if (!face) throw new Undrawn();
		return this.kept(face, node.type.name === 'raw_latex' && !this.lone);
	}

	environment(node: Node): DOMOutputSpec {
		const span = blockSpanOf(node);
		const written = span ? this.markup.slice(span.srcFrom, span.srcTo) : '';
		const face = written ? this.drawChip(written) : null;
		if (face) return this.kept(face, true);
		if (typstScopeOfDrawing(written.trim())?.lookup(String(node.attrs.name))?.origin !== 'std') throw new Undrawn();
		return ['div', 0];
	}

	picture(node: Node): HTMLElement {
		if (node.childCount > 0) throw new Undrawn();
		return this.kept(imageNodeFace(node), true);
	}

	serializer(): DOMSerializer {
		const base = DOMSerializer.fromSchema(typSchema);
		function undrawn(): never {
			throw new Undrawn();
		}
		return new DOMSerializer(
			{
				...base.nodes,
				...Object.fromEntries(UNDRAWN.map((name) => [name, undrawn])),
				image: (node) => this.picture(node),
				inline_latex: (node) => this.chip(node),
				raw_latex: (node) => this.chip(node),
				typ_env: (node) => this.environment(node),
				inline_math: (node) => renderStaticMath(node.textContent, false, 'typst'),
				block_math: (node) => renderStaticMath(node.textContent, true, 'typst')
			},
			base.marks
		);
	}
}

function parseMarkup(markup: string): Node | null {
	try {
		return typstToProseMirror(markup).doc;
	} catch {
		return null;
	}
}

export function drawTypstMarkup(markup: string, drawChip: ChipFaceMaker): MarkupDrawing | null {
	const doc = parseMarkup(markup);
	if (!doc) return null;
	const lone = doc.childCount === 1 && doc.firstChild!.type.name === 'raw_latex';
	const drawn = new MarkupFaces(markup, drawChip, lone);
	const only = doc.childCount === 1 && doc.firstChild!.type.name === 'paragraph' ? doc.firstChild! : null;
	try {
		const content = drawn.serializer().serializeFragment(only ? only.content : doc.content);
		const block = lone ? drawn.line : !only || drawn.line;
		const dom = document.createElement(block ? 'div' : 'span');
		dom.appendChild(content);
		const single = lone || only?.childCount === 1;
		const silent = single && drawn.faces.length === 1 && drawn.faces[0].dom.classList.contains(QUIET);
		return { dom, block, empty: (!!only && only.childCount === 0) || silent, faces: drawn.faces };
	} catch (e) {
		drawn.faces.forEach((face) => face.destroy?.());
		if (e instanceof Undrawn) return null;
		throw e;
	}
}
