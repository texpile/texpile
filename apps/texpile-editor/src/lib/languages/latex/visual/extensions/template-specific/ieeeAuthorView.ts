import { RawLatexView } from '$lib/editor/visual/extensions/raw-latex/rawLatexView';
import { parseIeeeAuthors, isIeeeAuthorBlock, ordinalLabel } from './ieeeAuthor';
import type { Node } from 'prosemirror-model';
import type { EditorView as ProseMirrorView } from 'prosemirror-view';

export { isIeeeAuthorBlock };

// read-only rendered author preview on top of the verbatim raw_latex block (still edited as plain
// latex in the CodeMirror below). no structured editing, so nothing can mangle the source.
export class IeeeAuthorView extends RawLatexView {
	preview: HTMLElement;
	private shownKey = '\0';

	constructor(node: Node, view: ProseMirrorView, getPos: () => number) {
		super(node, view, getPos);
		this.preview = document.createElement('div');
		this.preview.contentEditable = 'false';
		this.preview.className = 'ieee-author-preview border-surface-300-700 flex flex-wrap justify-center gap-x-10 gap-y-3 border-b px-2 py-2';
		this.dom.insertBefore(this.preview, this.dom.firstChild);
		this.renderPreview(node.textContent);
	}

	private renderPreview(text: string): void {
		const authors = parseIeeeAuthors(text);
		const key = JSON.stringify(authors);
		if (key === this.shownKey) return;
		this.shownKey = key;
		this.preview.replaceChildren();
		if (!authors || authors.length === 0) {
			this.preview.style.display = 'none';
			return;
		}
		this.preview.style.display = '';
		authors.forEach((a, i) => {
			const card = document.createElement('div');
			card.className = 'min-w-[10rem] text-center';

			const name = document.createElement('div');
			name.className = 'text-sm font-semibold';
			if (a.ordinal) {
				const label = ordinalLabel(i + 1);
				name.append(document.createTextNode(label.slice(0, -2)));
				const sup = document.createElement('sup');
				sup.textContent = label.slice(-2);
				name.append(sup, document.createTextNode(' '));
			}
			name.append(document.createTextNode(a.name));
			card.append(name);

			for (const line of a.affil) {
				const ln = document.createElement('div');
				ln.className = 'text-muted text-xs' + (line.italic ? ' italic' : '');
				ln.textContent = line.text;
				card.append(ln);
			}
			this.preview.append(card);
		});
	}

	override update(node: Node): boolean {
		const ok = super.update(node);
		if (ok) this.renderPreview(node.textContent);
		return ok;
	}
}
