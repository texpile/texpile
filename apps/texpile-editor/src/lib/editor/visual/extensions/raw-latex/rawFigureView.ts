import { RawLatexView } from './rawLatexView';
import { joinPath, isRemoteSrc } from '$lib/workspace/fileSystem';
import { editorFileUrl } from '$lib/editor/visual/fileAccess';
import type { Node } from 'prosemirror-model';
import type { EditorView as ProseMirrorView } from 'prosemirror-view';

// preview view for raw figure blocks we can't model as a single editable image (subfigures,
// multiple \includegraphics). the block stays verbatim raw_latex; only the display is enriched
// with a read-only preview strip above the editable CodeMirror raw.

const INCLUDEGRAPHICS_RE = /\\includegraphics\s*(?:\[[^\]]*\])?\s*\{([^}]+)\}/g;

/** all \includegraphics paths in a raw block, in order. */
export function extractGraphicsPaths(text: string): string[] {
	const out: string[] = [];
	const re = new RegExp(INCLUDEGRAPHICS_RE);
	let m: RegExpExecArray | null;
	while ((m = re.exec(text))) out.push(m[1].trim());
	return out;
}

/** true when a raw block has at least one \includegraphics worth previewing. */
export function isRawFigure(text: string): boolean {
	return extractGraphicsPaths(text).length > 0;
}

export class RawFigureView extends RawLatexView {
	imageDir: () => string;
	preview: HTMLElement;
	private shownKey = '\0';

	constructor(node: Node, view: ProseMirrorView, getPos: () => number, imageDir: () => string) {
		super(node, view, getPos);
		this.imageDir = imageDir;

		this.preview = document.createElement('div');
		this.preview.contentEditable = 'false';
		this.preview.className =
			'raw-figure-preview border-surface-300-700 flex flex-wrap items-center justify-center gap-3 border-b px-2 py-2';
		// preview goes above the codemirror raw editor
		this.dom.insertBefore(this.preview, this.dom.firstChild);
		this.renderPreview(node.textContent);
	}

	private resolveSrc(src: string): string {
		if (isRemoteSrc(src)) return src;
		const dir = this.imageDir();
		return dir ? editorFileUrl(joinPath(dir, src)) : src;
	}

	private renderPreview(text: string): void {
		const paths = extractGraphicsPaths(text);
		const key = paths.join('|');
		if (key === this.shownKey) return; // nothing to redraw
		this.shownKey = key;
		this.preview.replaceChildren();
		if (paths.length === 0) {
			this.preview.style.display = 'none';
			return;
		}
		this.preview.style.display = '';
		for (const p of paths) {
			const img = document.createElement('img');
			img.src = this.resolveSrc(p);
			img.alt = p;
			img.title = p;
			img.draggable = false;
			img.className = 'max-h-40 max-w-full rounded-base object-contain';
			img.onerror = () => img.replaceWith(this.makeMissing(p));
			this.preview.appendChild(img);
		}
	}

	private makeMissing(src: string): HTMLElement {
		const box = document.createElement('div');
		box.className = 'text-surface-500 border-surface-300-700 flex h-20 items-center rounded-base border border-dashed px-3 text-xs';
		box.textContent = `\u{1F5BC} ${src}`;
		return box;
	}

	override update(node: Node): boolean {
		const ok = super.update(node);
		if (ok) this.renderPreview(node.textContent);
		return ok;
	}
}
