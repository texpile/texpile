// Typst markup drawn as the visual editor draws a file of it
import { DOMSerializer, type DOMOutputSpec, type Node } from 'prosemirror-model';
import { serializeFaceFragment } from '$lib/editor/canvas';
import { blockSpanOf } from '$lib/editor/visual/sourceSpans';
import { type ChipFace, type ChipFaceMaker } from '$lib/editor/visual/extensions/drawnChips/chipFace';
import { appendTo, type PartElement } from '$lib/editor/visual/extensions/drawnChips/faces/partElements';
import { formulaFace } from '$lib/editor/visual/extensions/mathlivebridge/mathStatic';
import { typstToProseMirror } from '../../convert/converter';
import { typSchema } from '../../schema';
import { typstScopeOfDrawing } from '../scope/fileScopeNow.svelte';
import type { MarkupDrawing } from '../parts/drawingFace';
import { imageNodeFace } from '../parts/imageDrawing';
import { typstElement } from '../looks/typstLooks';

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

	// FaceElement stands in the serializer for the node it would draw
	private kept(face: ChipFace, line: boolean): DOMOutputSpec {
		this.faces.push(face);
		if (face.line || line) this.line = true;
		return face.dom as unknown as DOMOutputSpec;
	}

	private formula(node: Node, display: boolean): DOMOutputSpec {
		return formulaFace(node.textContent, display, 'typst') as unknown as DOMOutputSpec;
	}

	chip(node: Node): DOMOutputSpec {
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

	picture(node: Node): DOMOutputSpec {
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
				inline_math: (node) => this.formula(node, false),
				block_math: (node) => this.formula(node, true)
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

function drawnAs(doc: Node, markup: string, drawChip: ChipFaceMaker): MarkupDrawing {
	const lone = doc.childCount === 1 && doc.firstChild!.type.name === 'raw_latex';
	const drawn = new MarkupFaces(markup, drawChip, lone);
	const only = doc.childCount === 1 && doc.firstChild!.type.name === 'paragraph' ? doc.firstChild! : null;
	try {
		const fragment = only ? only.content : doc.content;
		const serializer = drawn.serializer();
		const content = serializeFaceFragment(serializer, fragment);
		const block = lone ? drawn.line : !only || drawn.line;
		const tag = block ? 'div' : 'span';
		const dom = typstElement(tag);
		appendTo(dom, content as unknown as PartElement);
		const single = lone || only?.childCount === 1;
		const silent = single && drawn.faces.length === 1 && drawn.faces[0].dom.classList.contains(QUIET);
		return { dom, block, empty: (!!only && only.childCount === 0) || silent, faces: drawn.faces };
	} catch (e) {
		drawn.faces.forEach((face) => face.destroy?.());
		throw e;
	}
}

export function drawTypstMarkup(markup: string, drawChip: ChipFaceMaker): MarkupDrawing | null {
	const doc = parseMarkup(markup);
	if (!doc) return null;
	try {
		return drawnAs(doc, markup, drawChip);
	} catch (e) {
		return failed(e);
	}
}

function failed(e: unknown): null {
	if (e instanceof Undrawn) return null;
	throw e;
}
