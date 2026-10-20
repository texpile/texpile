import { RawLatexView } from './rawLatexView';
import { codeOnly } from '$lib/languages/latex/texCode';
import { fileCallsIn } from '$lib/languages/latex/knowledge/calls/fileCommands';
import { rolesOf } from '$lib/languages/latex/knowledge/calls/commandCalls';
import { joinPath, isRemoteSrc } from '$lib/workspace/fileSystem';
import { editorFileUrl, FILES_ARRIVED, firstExistingUrl } from '$lib/editor/visual/fileAccess';
import { browserGraphicNames } from '$lib/editor/visual/graphicsCandidates';
import type { Node } from 'prosemirror-model';
import type { EditorView as ProseMirrorView } from 'prosemirror-view';

// preview view for raw figure blocks we can't model as a single editable image (subfigures,
// multiple \includegraphics). the block stays verbatim raw_latex; only the display is enriched
// with a read-only preview strip above the editable CodeMirror raw.

type GraphicPreview = { path: string; names: string[] };

function graphicPreviews(text: string): GraphicPreview[] {
	return fileCallsIn(codeOnly(text), ['graphic']).flatMap((call) =>
		call.args
			.filter((a) => rolesOf(a.arg).includes('graphic'))
			.flatMap((a) => a.values.slice(0, 1).map((v) => ({ path: v.value, names: browserGraphicNames(v.value, a.arg.accepts) })))
			.filter((preview) => preview.names.length)
	);
}

/** all graphics in a raw block an <img> can show, in order. */
export function extractGraphicsPaths(text: string): string[] {
	return graphicPreviews(text).map((preview) => preview.path);
}

/** true when a raw block has at least one graphic worth previewing. */
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
		window.addEventListener(FILES_ARRIVED, this.drawAgain);
	}

	// a guest's picture comes from the host after the preview first drew it missing
	private drawAgain = (): void => {
		if (!this.preview.querySelector('[data-missing]')) return;
		this.shownKey = '\0';
		this.renderPreview(this.node.textContent);
	};

	override destroy(): void {
		window.removeEventListener(FILES_ARRIVED, this.drawAgain);
		super.destroy();
	}

	private resolveSrc(src: string): string {
		if (isRemoteSrc(src)) return src;
		const dir = this.imageDir();
		return dir ? editorFileUrl(joinPath(dir, src)) : src;
	}

	private renderPreview(text: string): void {
		const previews = graphicPreviews(text);
		const key = previews.map((preview) => preview.path).join('|');
		if (key === this.shownKey) return; // nothing to redraw
		this.shownKey = key;
		this.preview.replaceChildren();
		if (previews.length === 0) {
			this.preview.style.display = 'none';
			return;
		}
		this.preview.style.display = '';
		for (const { path, names } of previews) {
			const img = document.createElement('img');
			img.alt = path;
			img.title = path;
			img.draggable = false;
			img.className = 'max-h-40 max-w-full rounded-base object-contain';
			img.onerror = () => img.replaceWith(this.makeMissing(path));
			this.preview.appendChild(img);
			void firstExistingUrl(names.map((n) => this.resolveSrc(n))).then((url) => {
				if (url) img.src = url;
				else img.replaceWith(this.makeMissing(path));
			});
		}
	}

	private makeMissing(src: string): HTMLElement {
		const box = document.createElement('div');
		box.className = 'text-muted border-surface-300-700 flex h-20 items-center rounded-base border border-dashed px-3 text-xs';
		box.textContent = `\u{1F5BC} ${src}`;
		box.dataset.missing = '';
		return box;
	}

	override update(node: Node): boolean {
		const ok = super.update(node);
		if (ok) this.renderPreview(node.textContent);
		return ok;
	}
}
