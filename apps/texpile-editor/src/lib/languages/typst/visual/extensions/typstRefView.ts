// NodeView for typ_ref (`@target`): resolves the target at render time, the way the LaTeX editor
// resolves its citation and \ref chips, instead of showing the raw key:
//
//   - a bibliography key renders "(Author Year)" with the citation tint
//   - a label owned by a table or figure renders "Table N" / "Figure N" - the editor's own
//     approximate numbering, matching the wrapper headers (the preview is the authority)
//   - an equation label stays "@label": equations carry no number in this editor (typst numbering
//     is the template's #set rule), so the label IS the honest display
//   - anything unresolved stays a neutral "@target"
//
// The DOC carries only the target - resolution is pure display, which is what makes @key
// round-trip safe whichever of typst's two meanings it has.
import type { Node as PMNode } from 'prosemirror-model';
import type { EditorView, NodeView } from 'prosemirror-view';
import { referenceStore } from '$lib/stores/editorStore';
import { citationRefsWithLibrary } from '$lib/library/libraryRefs';
import { observe } from '$lib/runes/observe.svelte';

export class TypstRefView implements NodeView {
	dom: HTMLElement;
	node: PMNode;
	private unsubscribe: () => void;

	constructor(
		node: PMNode,
		private view: EditorView
	) {
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

	/** what the label names in the doc, with the editor's own (approximate) running number.
	 *  Counting mirrors the @ picker's, so the chip and the menu agree. */
	private resolveLabel(target: string): { kind: 'table' | 'figure' | 'equation'; number: number } | null {
		let tables = 0;
		let figures = 0;
		let found: { kind: 'table' | 'figure' | 'equation'; number: number } | null = null;
		this.view.state.doc.descendants((n) => {
			if (found) return false;
			if (n.type.name === 'table_wrapper' && n.attrs.label) {
				tables++;
				if (n.attrs.label === target) found = { kind: 'table', number: tables };
			} else if (n.type.name === 'image' && n.attrs.label && n.attrs.numbered !== false) {
				figures++;
				if (n.attrs.label === target) found = { kind: 'figure', number: figures };
			} else if (n.type.name === 'block_math' && n.attrs.label === target) {
				found = { kind: 'equation', number: 0 };
			}
		});
		return found;
	}

	private render(node: PMNode): void {
		const target = String(node.attrs.target ?? '');
		// the store starts as null (typed a lie) until a bibliography loads
		const bib = citationRefsWithLibrary(referenceStore.current ?? []).find((r) => r.key === target);
		if (bib) {
			const author = (Array.isArray(bib.author) ? bib.author.join(', ') : bib.author) || 'Unknown';
			const year = bib.year ?? bib.date?.slice(0, 4) ?? 'n.d.';
			this.dom.textContent = `(${author} ${year})`;
			this.dom.className = 'typ-ref typ-ref-known';
			this.dom.title = [`@${target}`, bib.title].filter(Boolean).join(' - ');
			return;
		}
		const owner = this.resolveLabel(target);
		if (owner) {
			// equations have no honest number (typst numbering is the template's #set rule), so
			// their chip names the kind and the label instead
			this.dom.textContent =
				owner.kind === 'table' ? `Table ${owner.number}` : owner.kind === 'figure' ? `Figure ${owner.number}` : `Equation: ${target}`;
			this.dom.className = 'typ-ref typ-ref-known';
			this.dom.title = `@${target}`;
			return;
		}
		// unresolved: maybe a label in an unmodeled island, maybe a typo; show the raw ref
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
