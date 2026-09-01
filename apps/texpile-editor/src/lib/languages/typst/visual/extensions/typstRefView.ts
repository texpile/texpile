// NodeView for typ_ref (`@target`): shows the label, and resolves only what an authority can
// answer.
//
//   - a bibliography key renders "(Author Year)" with the citation tint, because a parsed .bib
//     entry is data the editor holds, not a count it made up
//   - everything else stays "@target". Typst numbering is the template's #set rule, which this
//     editor does not evaluate, and typst has no .aux to read a number back from - so the label
//     IS the honest display. Counting tables and figures here produced a number that looked like
//     the compiler's and was not.
//
// The DOC carries only the target - resolution is pure display, which is what makes @key
// round-trip safe whichever of typst's two meanings it has.
import type { Node as PMNode } from 'prosemirror-model';
import type { NodeView } from 'prosemirror-view';
import { referenceStore } from '$lib/stores/editorStore';
import { observe } from '$lib/runes/observe.svelte';

export class TypstRefView implements NodeView {
	dom: HTMLElement;
	node: PMNode;
	private unsubscribe: () => void;

	constructor(node: PMNode) {
		this.node = node;
		this.dom = document.createElement('span');
		this.dom.contentEditable = 'false';
		// the bibliography loads after the doc first renders; chips upgrade from @key when it
		// lands (observe fires once immediately, which is the initial render)
		this.unsubscribe = observe(
			() => referenceStore.current,
			() => this.render(this.node)
		);
	}

	private render(node: PMNode): void {
		const target = String(node.attrs.target ?? '');
		// the store starts as null (typed a lie) until a bibliography loads
		const bib = (referenceStore.current ?? []).find((r) => r.key === target);
		if (bib) {
			const author = (Array.isArray(bib.author) ? bib.author.join(', ') : bib.author) || 'Unknown';
			const year = bib.year ?? bib.date?.slice(0, 4) ?? 'n.d.';
			this.dom.textContent = `(${author} ${year})`;
			this.dom.className = 'typ-ref typ-ref-known';
			this.dom.title = [`@${target}`, bib.title].filter(Boolean).join(' - ');
			return;
		}
		this.dom.textContent = `@${target}`;
		this.dom.className = 'typ-ref';
		this.dom.title = target;
	}

	update(node: PMNode): boolean {
		if (node.type !== this.node.type) return false;
		this.node = node;
		this.render(node);
		return true;
	}

	destroy(): void {
		this.unsubscribe();
	}
}
