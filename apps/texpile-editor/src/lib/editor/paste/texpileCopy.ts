// A copy from Texpile's own visual editors: marked when it is made, so a paste can keep all of it. Not
// ProseMirror's slice marker, which every ProseMirror or Tiptap app writes too.
import {
	DOMParser,
	DOMSerializer,
	type Attrs,
	type DOMOutputSpec,
	type Fragment,
	type Mark,
	type Node as PMNode,
	type Schema,
	type TagParseRule
} from 'prosemirror-model';
import { ListDOMSerializer } from 'prosemirror-flat-list';
import { addCopiedMathLatex } from './pastedMath';
import { markCopiedRawLanguages } from './pastedRawBlocks';

const COPY_MARK = 'data-texpile-copy';
// a mark's attributes as JSON: its DOM says only what it looks like (an \emph and a \textit are both <em>)
const MARK_ATTRS = 'data-texpile-mark';
// the same for a node: a parse origin is kept by node identity, so a paste never claims the original's bytes
const NODE_ATTRS = 'data-texpile-node';

export function isTexpileCopy(html: string): boolean {
	return html.includes(COPY_MARK);
}

class MarkingSerializer extends ListDOMSerializer {
	override serializeFragment(fragment: Fragment, options: { document?: Document } = {}, target?: HTMLElement | DocumentFragment) {
		const dom = super.serializeFragment(fragment, options, target);
		// the top level only: node content comes back through here with its own target
		if (target) return dom;
		for (const child of dom.childNodes) if (child.nodeType === 1) (child as Element).setAttribute(COPY_MARK, '');
		addCopiedMathLatex(dom);
		markCopiedRawLanguages(fragment, dom);
		return dom;
	}
}

function withCopiedAttrs(spec: DOMOutputSpec, holder: Mark | PMNode, attribute: string): DOMOutputSpec {
	if (typeof spec === 'string') return spec;
	const value = JSON.stringify({ type: holder.type.name, attrs: holder.attrs });
	if (Array.isArray(spec)) {
		const [tag, second, ...rest] = spec as readonly unknown[];
		const hasAttrs = second !== null && typeof second === 'object' && !Array.isArray(second) && !('nodeType' in second);
		return (
			hasAttrs ? [tag, { ...second, [attribute]: value }, ...rest] : [tag, { [attribute]: value }, ...spec.slice(1)]
		) as DOMOutputSpec;
	}
	const dom = typeof spec === 'object' && 'dom' in spec ? spec.dom : spec;
	if (typeof dom === 'object' && 'setAttribute' in dom) (dom as Element).setAttribute(attribute, value);
	return spec;
}

function withNodeAttrs(spec: DOMOutputSpec, node: PMNode): DOMOutputSpec {
	if (Array.isArray(spec) && (spec[0] === 'ul' || spec[0] === 'ol')) {
		const [tag, item] = spec as [string, DOMOutputSpec];
		return [tag, withCopiedAttrs(item, node, NODE_ATTRS)];
	}
	return withCopiedAttrs(spec, node, NODE_ATTRS);
}

/** the editor's own clipboard HTML, marked as Texpile's */
export function texpileClipboardSerializer(schema: Schema): DOMSerializer {
	const marks = Object.fromEntries(
		Object.entries(ListDOMSerializer.marksFromSchema(schema)).map(([name, render]) => [
			name,
			(mark: Mark, inline: boolean) => withCopiedAttrs(render(mark, inline), mark, MARK_ATTRS)
		])
	);
	const nodes = Object.fromEntries(
		Object.entries(ListDOMSerializer.nodesFromSchema(schema)).map(([name, render]) => [
			name,
			(node: PMNode) => withNodeAttrs(render(node), node)
		])
	);
	return new MarkingSerializer(nodes, marks);
}

function copiedAttrs(dom: HTMLElement, attribute: string, type: string): Attrs | null {
	const raw = dom.getAttribute(attribute);
	if (!raw) return null;
	try {
		const copied = JSON.parse(raw) as { type?: string; attrs?: Attrs };
		return copied.type === type && copied.attrs ? copied.attrs : null;
	} catch {
		return null;
	}
}

export function texpileClipboardParser(schema: Schema): DOMParser {
	const rules = DOMParser.fromSchema(schema).rules.map((rule) => {
		if (!('tag' in rule)) return rule;
		const tagRule = rule as TagParseRule;
		const type = tagRule.mark ?? tagRule.node;
		if (!type) return rule;
		const attribute = tagRule.mark ? MARK_ATTRS : NODE_ATTRS;
		return {
			...tagRule,
			getAttrs(dom: HTMLElement) {
				const read = tagRule.getAttrs ? tagRule.getAttrs(dom) : (tagRule.attrs ?? null);
				const copied = read === false ? null : copiedAttrs(dom, attribute, type);
				return copied ? { ...read, ...copied } : read;
			}
		};
	});
	return new DOMParser(schema, rules);
}
