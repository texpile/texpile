/* Copyright 2024 Mozilla Foundation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/** renders a single PDF page (canvas + text layer + annotation layer); derivative work based on PDF.js pdf_page_view.js. */
import type { PDFPageProxy, PageViewport, TextLayer } from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { EventBus } from './EventBus.js';
import { AnnotationLayerBuilder } from './AnnotationLayerBuilder.js';
import type { SimpleLinkService } from './SimpleLinkService.js';

let setLayerDimensions: typeof import('pdfjs-dist/legacy/build/pdf.mjs').setLayerDimensions;

async function ensurePdfJsLoaded() {
	if (!setLayerDimensions) {
		const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
		setLayerDimensions = pdfjs.setLayerDimensions;
	}
}

export interface PDFPageViewOptions {
	container: HTMLElement;
	id: number;
	defaultViewport: PageViewport;
	eventBus: EventBus;
	scale?: number;
	rotation?: number;
	linkService?: SimpleLinkService;
}

export const RenderingStates = {
	INITIAL: 0,
	RUNNING: 1,
	PAUSED: 2,
	FINISHED: 3
} as const;

export type RenderingState = (typeof RenderingStates)[keyof typeof RenderingStates];

export class PDFPageView {
	readonly id: number;
	readonly eventBus: EventBus;

	private container: HTMLElement;
	private viewport: PageViewport;
	private pdfPage: PDFPageProxy | null = null;
	private scale: number;
	private rotation: number;
	private pdfPageRotate: number = 0;

	public div: HTMLDivElement;
	private canvas: HTMLCanvasElement | null = null;
	private canvasWrapper: HTMLDivElement | null = null;
	private textLayerDiv: HTMLDivElement | null = null;
	private selectionAbort: AbortController | null = null;

	private linkService: SimpleLinkService | null = null;
	private annotationLayerBuilder: AnnotationLayerBuilder | null = null;
	private annotationLayerRendered = false;

	public renderingState: RenderingState = RenderingStates.INITIAL;
	private renderTask: ReturnType<PDFPageProxy['render']> | null = null;

	private textLayer: TextLayer | null = null;
	private textLayerRendered = false;

	// text layer data for search
	public textDivs: HTMLElement[] = [];
	public textContentItemsStr: string[] = [];

	constructor(options: PDFPageViewOptions) {
		this.id = options.id;
		this.container = options.container;
		this.eventBus = options.eventBus;
		this.scale = options.scale ?? 1.0;
		this.rotation = options.rotation ?? 0;
		this.viewport = options.defaultViewport;
		this.linkService = options.linkService ?? null;

		this.div = document.createElement('div');
		this.div.className = 'page';
		this.div.setAttribute('data-page-number', String(this.id));
		this.div.setAttribute('role', 'region');

		this.setDimensions();
		this.container.appendChild(this.div);
	}

	private async setDimensions(): Promise<void> {
		const { width, height } = this.viewport;
		this.div.style.width = `${Math.floor(width)}px`;
		this.div.style.height = `${Math.floor(height)}px`;

		// --scale-factor drives text layer scaling; viewport.scale already includes our scale factor
		this.div.style.setProperty('--scale-factor', String(this.viewport.scale));

		const totalRotation = (this.rotation + this.pdfPageRotate) % 360;
		this.div.setAttribute('data-main-rotation', String(totalRotation));

		// mustFlip=false: the text layer uses raw page coordinates, rotation is CSS transforms
		if (this.textLayerDiv) {
			await ensurePdfJsLoaded();
			setLayerDimensions(this.textLayerDiv, this.viewport, /* mustFlip */ false);
		}
	}

	setPdfPage(pdfPage: PDFPageProxy): void {
		this.pdfPage = pdfPage;
		this.pdfPageRotate = pdfPage.rotate;
		this.updateViewport();
	}

	private updateViewport(): void {
		if (!this.pdfPage) return;

		const totalRotation = (this.rotation + this.pdfPageRotate) % 360;
		this.viewport = this.pdfPage.getViewport({
			scale: this.scale,
			rotation: totalRotation
		});
		this.setDimensions();
	}

	update({ scale, rotation, lazy = false }: { scale?: number; rotation?: number; lazy?: boolean }): void {
		if (scale !== undefined) {
			this.scale = scale;
		}
		if (rotation !== undefined) {
			this.rotation = rotation;
		}
		this.updateViewport();

		// off-screen page: drop the stale raster (cancelling any in-flight render) and let the
		// viewer re-draw it lazily when it scrolls back in; the sized div stays so layout holds
		if (lazy) {
			if (this.renderingState !== RenderingStates.INITIAL) this.reset();
			return;
		}

		if (this.renderingState === RenderingStates.FINISHED) {
			// TextLayer.update() handles both scale and rotation (rotation via CSS from data-main-rotation)
			if (this.textLayer && this.textLayerRendered) {
				this.textLayerDiv!.hidden = true;
				this.textLayer.update({
					viewport: this.viewport
				});
				this.textLayerDiv!.hidden = false;
			}
			if (this.annotationLayerBuilder && this.annotationLayerRendered) {
				this.annotationLayerBuilder.update(this.viewport);
			}
			this.resetCanvas();
			this.draw();
		}
	}

	private resetCanvas(): void {
		this.cancelRendering();
		this.renderingState = RenderingStates.INITIAL;

		if (this.canvas) {
			this.canvas.width = 0;
			this.canvas.height = 0;
			this.canvas.remove();
			this.canvas = null;
		}
		if (this.canvasWrapper) {
			this.canvasWrapper.remove();
			this.canvasWrapper = null;
		}
	}

	reset(): void {
		this.resetCanvas();

		this.selectionAbort?.abort();
		this.selectionAbort = null;
		if (this.textLayerDiv) {
			this.textLayerDiv.remove();
			this.textLayerDiv = null;
		}
		this.textLayer = null;
		this.textLayerRendered = false;
		this.textDivs = [];
		this.textContentItemsStr = [];

		if (this.annotationLayerBuilder) {
			this.annotationLayerBuilder.destroy();
			this.annotationLayerBuilder = null;
		}
		this.annotationLayerRendered = false;
	}

	async draw(): Promise<void> {
		if (!this.pdfPage || this.renderingState !== RenderingStates.INITIAL) {
			return;
		}

		this.renderingState = RenderingStates.RUNNING;

		try {
			this.canvasWrapper = document.createElement('div');
			this.canvasWrapper.className = 'canvasWrapper';
			this.div.appendChild(this.canvasWrapper);

			this.canvas = document.createElement('canvas');
			this.canvas.className = 'pdf-canvas';
			this.canvasWrapper.appendChild(this.canvas);

			const outputScale = window.devicePixelRatio || 1;
			const { width, height } = this.viewport;

			this.canvas.width = Math.floor(width * outputScale);
			this.canvas.height = Math.floor(height * outputScale);
			this.canvas.style.width = `${Math.floor(width)}px`;
			this.canvas.style.height = `${Math.floor(height)}px`;

			const ctx = this.canvas.getContext('2d')!;
			ctx.scale(outputScale, outputScale);

			this.renderTask = this.pdfPage.render({
				canvasContext: ctx,
				viewport: this.viewport,
				canvas: this.canvas
			});

			await this.renderTask.promise;
			this.renderTask = null;

			// a reset()/eviction can land while we await the layers below; bail instead of
			// resurrecting a torn-down page as FINISHED
			if ((this.renderingState as RenderingState) !== RenderingStates.RUNNING) return;

			if (!this.textLayerRendered) {
				await this.renderTextLayer();
			}
			if ((this.renderingState as RenderingState) !== RenderingStates.RUNNING) return;

			if (!this.annotationLayerRendered) {
				await this.renderAnnotationLayer();
			}
			if ((this.renderingState as RenderingState) !== RenderingStates.RUNNING) return;

			this.renderingState = RenderingStates.FINISHED;
			this.eventBus.dispatch('pagerendered', {
				pageNumber: this.id,
				source: this
			});
		} catch (error) {
			if ((error as Error).name === 'RenderingCancelledException') {
				return;
			}
			this.renderingState = RenderingStates.INITIAL;
			console.error('Error rendering page:', error);
		}
	}

	private async renderTextLayer(): Promise<void> {
		if (!this.pdfPage) return;

		if (this.textLayerRendered && this.textLayer) {
			this.textLayerDiv!.hidden = true;
			this.textLayer.update({ viewport: this.viewport });
			this.textLayerDiv!.hidden = false;
			return;
		}

		const textLayerDiv = document.createElement('div');
		textLayerDiv.className = 'textLayer';
		this.div.appendChild(textLayerDiv);
		this.textLayerDiv = textLayerDiv;

		try {
			const [{ TextLayer }] = await Promise.all([import('pdfjs-dist/legacy/build/pdf.mjs'), ensurePdfJsLoaded()]);

			const textContent = await this.pdfPage.getTextContent();

			// reset() while we were loading: the div is gone, don't rebuild onto it
			if (this.textLayerDiv !== textLayerDiv) return;

			this.textDivs = [];
			this.textContentItemsStr = [];

			// mustFlip=false: the text layer uses raw page coordinates, rotation is CSS transforms
			setLayerDimensions(textLayerDiv, this.viewport, /* mustFlip */ false);

			const textLayer = new TextLayer({
				textContentSource: textContent,
				container: textLayerDiv,
				viewport: this.viewport
			});
			this.textLayer = textLayer;

			await textLayer.render();
			if (this.textLayerDiv !== textLayerDiv) return;
			this.textLayerRendered = true;

			this.setupTextSelection(textLayerDiv);

			// extract text from the rendered spans so textDivs and textContentItemsStr stay 1:1
			const spans = textLayerDiv.querySelectorAll('span:not(.markedContent)');
			spans.forEach((span) => {
				this.textDivs.push(span as HTMLElement);
				this.textContentItemsStr.push(span.textContent || '');
			});

			this.eventBus.dispatch('textlayerrendered', {
				pageNumber: this.id,
				source: this
			});
		} catch (error) {
			console.error('Error rendering text layer:', error);
		}
	}

	// port of pdf.js TextLayerBuilder's selection handling: an .endOfContent "selection sink" plus a
	// .selecting class while dragging keeps the browser anchoring the drag inside the text layer;
	// without it, dragging across a page produces the classic huge/erratic selections
	private setupTextSelection(textLayerDiv: HTMLDivElement): void {
		const endOfContent = document.createElement('div');
		endOfContent.className = 'endOfContent';
		textLayerDiv.append(endOfContent);

		this.selectionAbort?.abort();
		this.selectionAbort = new AbortController();
		const { signal } = this.selectionAbort;
		const doc = textLayerDiv.ownerDocument;

		textLayerDiv.addEventListener('mousedown', () => textLayerDiv.classList.add('selecting'), { signal });
		const reset = () => textLayerDiv.classList.remove('selecting');
		doc.addEventListener('pointerup', reset, { signal });
		doc.defaultView?.addEventListener('blur', reset, { signal });
	}

	private async renderAnnotationLayer(): Promise<void> {
		if (!this.pdfPage || !this.linkService) {
			return;
		}

		if (this.annotationLayerRendered && this.annotationLayerBuilder) {
			this.annotationLayerBuilder.update(this.viewport);
			return;
		}

		try {
			const builder = new AnnotationLayerBuilder({
				pdfPage: this.pdfPage,
				linkService: this.linkService,
				renderForms: true,
				onAppend: (div) => {
					this.div.appendChild(div);
				}
			});
			this.annotationLayerBuilder = builder;

			await builder.render({
				viewport: this.viewport
			});
			// reset() while rendering destroyed the builder; don't mark it live
			if (this.annotationLayerBuilder !== builder) return;
			this.annotationLayerRendered = true;

			this.eventBus.dispatch('annotationlayerrendered', {
				pageNumber: this.id,
				source: this
			});
		} catch (error) {
			console.error('Error rendering annotation layer:', error);
		}
	}

	cancelRendering(): void {
		if (this.renderTask) {
			this.renderTask.cancel();
			this.renderTask = null;
		}
	}

	destroy(): void {
		this.cancelRendering();
		this.reset();
		this.pdfPage?.cleanup();
		this.div.remove();
	}

	get width(): number {
		return this.viewport.width;
	}

	get height(): number {
		return this.viewport.height;
	}

	// SyncTeX uses PDF points with a top-left origin, y increasing downward. Route through pdf.js's
	// viewport transform so page rotation and a non-zero MediaBox/CropBox offset are handled, not just
	// scale: the viewBox is [x0, y0, x1, y1] with top-left corner (x0, y1), so a SyncTeX point
	// (sx, sy) is the PDF point (x0 + sx, y1 - sy) before convertToViewportPoint maps it to pixels.

	/** SyncTeX coords (PDF points, top-left, y down) -> CSS px relative to this page's top-left. */
	pdfToPixel(x: number, y: number): { x: number; y: number } {
		const vp = this.viewport;
		if (typeof vp.convertToViewportPoint === 'function' && vp.viewBox) {
			const [vx, vy] = vp.convertToViewportPoint(vp.viewBox[0] + x, vp.viewBox[3] - y);
			return { x: vx, y: vy };
		}
		const s = vp.scale || 1;
		return { x: x * s, y: y * s };
	}

	/** CSS px relative to this page's top-left -> SyncTeX coords (PDF points, top-left, y down). */
	pixelToPdf(px: number, py: number): { x: number; y: number } {
		const vp = this.viewport;
		if (typeof vp.convertToPdfPoint === 'function' && vp.viewBox) {
			const [xPdf, yPdf] = vp.convertToPdfPoint(px, py);
			return { x: xPdf - vp.viewBox[0], y: vp.viewBox[3] - yPdf };
		}
		const s = vp.scale || 1;
		return { x: px / s, y: py / s };
	}

	/** Briefly flash a highlight rectangle on the page (CSS px). Used by SyncTeX forward search. */
	highlight(px: number, py: number, pw: number, ph: number): void {
		if (getComputedStyle(this.div).position === 'static') this.div.style.position = 'relative';
		const el = document.createElement('div');
		el.style.cssText =
			`position:absolute;left:${px}px;top:${py}px;width:${Math.max(8, pw)}px;height:${Math.max(14, ph)}px;` +
			`background:rgba(255,196,0,0.45);outline:1px solid rgba(220,150,0,0.7);border-radius:2px;` +
			`pointer-events:none;z-index:6;transition:opacity 0.7s ease;`;
		this.div.appendChild(el);
		setTimeout(() => (el.style.opacity = '0'), 1000);
		setTimeout(() => el.remove(), 1800);
	}
}
