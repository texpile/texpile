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

/** fullscreen presentation mode; derivative work based on PDF.js pdf_presentation_mode.js. */

import type { PDFDocumentProxy, PDFPageProxy, PageViewport } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { EventBus } from './EventBus';
import { SimpleLinkService } from './SimpleLinkService';
import { ANNOTATION_MODE_FORMS, PdfScripting, keepScriptedVisibility, type FormScripting } from './PdfScripting';

let AnnotationLayer: typeof import('pdfjs-dist/legacy/build/pdf.mjs').AnnotationLayer;

async function ensureAnnotationLayerLoaded() {
	if (!AnnotationLayer) {
		const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
		AnnotationLayer = pdfjs.AnnotationLayer;
	}
}

export enum PresentationModeState {
	UNKNOWN = 0,
	NORMAL = 1,
	CHANGING = 2,
	FULLSCREEN = 3
}

const MOUSE_SCROLL_COOLDOWN_TIME = 50; // in ms
const PAGE_SWITCH_THRESHOLD = 0.1;
const SWIPE_MIN_DISTANCE_THRESHOLD = 50;
const SWIPE_ANGLE_THRESHOLD = Math.PI / 6;

export type PresentationModeCallbacks = {
	onStateChange?: (state: PresentationModeState) => void;
	onPageChange?: (pageNumber: number) => void;
};

export class PdfPresentationMode {
	private state: PresentationModeState = PresentationModeState.UNKNOWN;
	private pdfDocument: PDFDocumentProxy | null = null;
	private currentPageNumber = 1;
	private totalPages = 0;

	private hostElement: HTMLDivElement | null = null;
	private shadowRoot: ShadowRoot | null = null;
	private container: HTMLDivElement | null = null;
	private pageWrapper: HTMLDivElement | null = null;
	private canvas: HTMLCanvasElement | null = null;
	private annotationLayerDiv: HTMLDivElement | null = null;
	private callbacks: PresentationModeCallbacks;

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	private annotationLayer: any = null;
	private linkService: SimpleLinkService | null = null;
	private eventBus: EventBus | null = null;
	private scripting: PdfScripting | null = null;
	private forms: Promise<FormScripting | null> = Promise.resolve(null);
	private readonly annotationCanvasMap = new Map<string, HTMLCanvasElement>();

	private fullscreenChangeAbortController: AbortController | null = null;
	private windowAbortController: AbortController | null = null;

	private mouseScrollTimeStamp = 0;
	private mouseScrollDelta = 0;
	private touchSwipeState: {
		startX: number;
		startY: number;
		endX: number;
		endY: number;
	} | null = null;

	private renderingPage = false;
	private currentViewport: PageViewport | null = null;

	constructor(callbacks: PresentationModeCallbacks = {}) {
		this.callbacks = callbacks;
	}

	setDocument(pdfDocument: PDFDocumentProxy | null): void {
		this.pdfDocument = pdfDocument;
		this.totalPages = pdfDocument?.numPages ?? 0;
	}

	setCurrentPage(pageNumber: number): void {
		this.currentPageNumber = Math.max(1, Math.min(pageNumber, this.totalPages));
	}

	get active(): boolean {
		return this.state === PresentationModeState.CHANGING || this.state === PresentationModeState.FULLSCREEN;
	}

	get currentState(): PresentationModeState {
		return this.state;
	}

	async request(): Promise<boolean> {
		if (this.active || !this.pdfDocument || this.totalPages === 0) {
			return false;
		}

		this.createPresentationContainer();

		if (!this.container) {
			return false;
		}

		this.addFullscreenChangeListeners();
		this.notifyStateChange(PresentationModeState.CHANGING);

		try {
			await this.container.requestFullscreen();
			return true;
		} catch {
			this.removeFullscreenChangeListeners();
			this.notifyStateChange(PresentationModeState.NORMAL);
			this.destroyPresentationContainer();
			return false;
		}
	}

	async exit(): Promise<void> {
		if (!this.active) {
			return;
		}

		if (document.fullscreenElement) {
			await document.exitFullscreen();
		}
	}

	nextPage(): boolean {
		if (this.currentPageNumber >= this.totalPages) {
			return false;
		}
		this.currentPageNumber++;
		this.renderCurrentPage();
		this.callbacks.onPageChange?.(this.currentPageNumber);
		return true;
	}

	previousPage(): boolean {
		if (this.currentPageNumber <= 1) {
			return false;
		}
		this.currentPageNumber--;
		this.renderCurrentPage();
		this.callbacks.onPageChange?.(this.currentPageNumber);
		return true;
	}

	goToPage(pageNumber: number): boolean {
		if (pageNumber < 1 || pageNumber > this.totalPages) {
			return false;
		}
		this.currentPageNumber = pageNumber;
		this.renderCurrentPage();
		this.callbacks.onPageChange?.(this.currentPageNumber);
		return true;
	}

	destroy(): void {
		this.exit();
		this.removeWindowListeners();
		this.removeFullscreenChangeListeners();
		this.destroyPresentationContainer();
	}

	private createPresentationContainer(): void {
		this.eventBus = new EventBus();
		this.linkService = new SimpleLinkService({
			eventBus: this.eventBus
		});

		// override goToPage so annotation links navigate within the presentation
		const originalGoToPage = this.linkService.goToPage.bind(this.linkService);
		this.linkService.goToPage = (pageNumber: number) => {
			this.goToPage(pageNumber);
			// still call the original for event dispatch
			originalGoToPage(pageNumber);
		};

		Object.defineProperty(this.linkService, 'pagesCount', {
			get: () => this.totalPages
		});

		this.hostElement = document.createElement('div');
		this.hostElement.style.cssText = `
			position: fixed;
			top: 0;
			left: 0;
			width: 100%;
			height: 100%;
			z-index: 999999;
		`;

		this.shadowRoot = this.hostElement.attachShadow({ mode: 'open' });

		const styleEl = document.createElement('style');
		styleEl.textContent = this.getPresentationStyles();
		this.shadowRoot.appendChild(styleEl);

		this.container = document.createElement('div');
		this.container.className = 'pdf-presentation-container';

		this.pageWrapper = document.createElement('div');
		this.pageWrapper.className = 'page-wrapper';

		this.canvas = document.createElement('canvas');
		this.canvas.className = 'presentation-canvas';

		this.annotationLayerDiv = document.createElement('div');
		this.annotationLayerDiv.className = 'annotationLayer';

		this.pageWrapper.appendChild(this.canvas);
		this.pageWrapper.appendChild(this.annotationLayerDiv);
		this.container.appendChild(this.pageWrapper);
		this.shadowRoot.appendChild(this.container);
		document.body.appendChild(this.hostElement);
		this.startScripting(this.eventBus, this.container);
	}

	private startScripting(eventBus: EventBus, root: HTMLElement): void {
		const doc = this.pdfDocument;
		if (!doc) return;
		const scripting = new PdfScripting(eventBus, root);
		this.scripting = scripting;
		this.forms = scripting.formsOf(doc).then((forms) => {
			if (this.scripting === scripting) void scripting.open(doc, forms);
			return forms;
		});
	}

	private getPresentationStyles(): string {
		return `
			.pdf-presentation-container {
				width: 100%;
				height: 100%;
				background-color: #000;
				display: flex;
				align-items: center;
				justify-content: center;
			}

			.page-wrapper {
				position: relative;
			}

			.presentation-canvas {
				display: block;
				position: relative;
				z-index: 0;
			}

			.annotationLayer {
				position: absolute;
				top: 0;
				left: 0;
				pointer-events: none;
				transform-origin: 0 0;
				z-index: 1;
			}

			.annotationLayer section {
				position: absolute;
				text-align: initial;
				pointer-events: auto;
				box-sizing: border-box;
				transform-origin: 0 0;
				user-select: none;
			}

			.annotationLayer .linkAnnotation > a,
			.annotationLayer .buttonWidgetAnnotation.pushButton > a {
				position: absolute;
				font-size: 1em;
				top: 0;
				left: 0;
				width: 100%;
				height: 100%;
			}

			.annotationLayer .linkAnnotation > a:hover,
			.annotationLayer .buttonWidgetAnnotation.pushButton > a:hover {
				opacity: 0.2;
				background-color: rgb(255 255 0);
				box-shadow: 0 2px 10px rgb(255 255 0);
			}

			.annotationLayer .linkAnnotation.hasBorder:hover {
				background-color: rgb(255 255 0 / 0.2);
			}

			.annotationLayer .annotationContent {
				position: absolute;
				width: 100%;
				height: 100%;
				pointer-events: none;
			}
		`;
	}

	private destroyPresentationContainer(): void {
		if (this.hostElement) {
			this.hostElement.remove();
			this.hostElement = null;
			this.shadowRoot = null;
			this.container = null;
			this.pageWrapper = null;
			this.canvas = null;
			this.annotationLayerDiv = null;
		}
		this.annotationLayer = null;
		this.linkService = null;
		this.scripting?.close();
		this.scripting = null;
		this.forms = Promise.resolve(null);
		this.eventBus?.destroy();
		this.eventBus = null;
		this.currentViewport = null;
	}

	private async renderCurrentPage(): Promise<void> {
		if (!this.pdfDocument || !this.canvas || !this.container || this.renderingPage) {
			return;
		}

		this.renderingPage = true;

		try {
			const page = await this.pdfDocument.getPage(this.currentPageNumber);

			// scale to fit the screen, keeping the aspect ratio
			const containerWidth = window.innerWidth;
			const containerHeight = window.innerHeight;

			const viewport = page.getViewport({ scale: 1, rotation: 0 });
			const pageWidth = viewport.width;
			const pageHeight = viewport.height;

			const scaleX = containerWidth / pageWidth;
			const scaleY = containerHeight / pageHeight;
			const scale = Math.min(scaleX, scaleY);

			const scaledViewport = page.getViewport({ scale, rotation: 0 });
			this.currentViewport = scaledViewport;

			this.canvas.width = scaledViewport.width;
			this.canvas.height = scaledViewport.height;

			const context = this.canvas.getContext('2d');
			if (!context) {
				return;
			}

			context.fillStyle = '#fff';
			context.fillRect(0, 0, this.canvas.width, this.canvas.height);

			const forms = await this.forms;
			this.annotationCanvasMap.clear();
			await page.render({
				canvasContext: context,
				viewport: scaledViewport,
				canvas: this.canvas,
				annotationCanvasMap: this.annotationCanvasMap,
				...(forms?.enableScripting ? { annotationMode: ANNOTATION_MODE_FORMS } : {})
			}).promise;

			if (this.pageWrapper) {
				this.pageWrapper.style.width = `${this.canvas.width}px`;
				this.pageWrapper.style.height = `${this.canvas.height}px`;
			}

			await this.renderAnnotationLayer(page, scaledViewport, forms);
			this.eventBus?.dispatch('pagerendered', { pageNumber: this.currentPageNumber });
		} catch (e) {
			console.error('Failed to render presentation page:', e);
		} finally {
			this.renderingPage = false;
		}
	}

	private async renderAnnotationLayer(page: PDFPageProxy, viewport: PageViewport, forms: FormScripting | null): Promise<void> {
		if (!this.annotationLayerDiv || !this.linkService) {
			return;
		}

		try {
			await ensureAnnotationLayerLoaded();

			this.annotationLayerDiv.innerHTML = '';

			const width = Math.floor(viewport.width);
			const height = Math.floor(viewport.height);

			// PDF.js AnnotationLayer expects these CSS variables (its dimensions use CSS round())
			this.annotationLayerDiv.style.setProperty('--scale-factor', '1');
			this.annotationLayerDiv.style.setProperty('--total-scale-factor', '1');
			this.annotationLayerDiv.style.setProperty('--scale-round-x', '1px');
			this.annotationLayerDiv.style.setProperty('--scale-round-y', '1px');

			const annotations = await page.getAnnotations({ intent: 'display' });
			if (annotations.length === 0) {
				return;
			}

			this.linkService.setDocument(this.pdfDocument);

			this.annotationLayer = new AnnotationLayer({
				div: this.annotationLayerDiv,
				accessibilityManager: null,
				annotationCanvasMap: this.annotationCanvasMap,
				annotationEditorUIManager: null,
				page: page,
				viewport: viewport.clone({ dontFlip: true }),
				structTreeLayer: null,
				commentManager: null,
				linkService: this.linkService,
				annotationStorage: forms?.annotationStorage ?? null
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
			} as any);

			await this.annotationLayer.render({
				annotations,
				imageResourcesPath: '',
				renderForms: false, // no forms in presentation mode
				linkService: this.linkService,
				downloadManager: undefined,
				annotationStorage: forms?.annotationStorage ?? null,
				enableScripting: forms?.enableScripting ?? false,
				hasJSActions: forms?.hasJSActions ?? false,
				fieldObjects: forms?.fieldObjects ?? null
			});
			keepScriptedVisibility(this.annotationLayerDiv, forms);

			// override dimensions after render, PDF.js sets CSS variable-based ones
			this.annotationLayerDiv.style.width = `${width}px`;
			this.annotationLayerDiv.style.height = `${height}px`;
		} catch (e) {
			console.error('Failed to render presentation annotation layer:', e);
		}
	}

	private notifyStateChange(newState: PresentationModeState): void {
		this.state = newState;
		this.callbacks.onStateChange?.(newState);
	}

	private enter(): void {
		this.notifyStateChange(PresentationModeState.FULLSCREEN);
		this.addWindowListeners();
		this.renderCurrentPage();

		document.getSelection()?.empty();
	}

	private doExit(): void {
		this.removeWindowListeners();
		this.destroyPresentationContainer();
		this.resetMouseScrollState();

		this.removeFullscreenChangeListeners();
		this.notifyStateChange(PresentationModeState.NORMAL);
	}

	private handleMouseWheel = (evt: WheelEvent): void => {
		if (!this.active) {
			return;
		}
		evt.preventDefault();

		const delta = this.normalizeWheelDelta(evt);
		const currentTime = Date.now();
		const storedTime = this.mouseScrollTimeStamp;

		// cooldown to prevent accidental double-switching
		if (currentTime > storedTime && currentTime - storedTime < MOUSE_SCROLL_COOLDOWN_TIME) {
			return;
		}

		// reset if direction changed
		if ((this.mouseScrollDelta > 0 && delta < 0) || (this.mouseScrollDelta < 0 && delta > 0)) {
			this.resetMouseScrollState();
		}

		this.mouseScrollDelta += delta;

		if (Math.abs(this.mouseScrollDelta) >= PAGE_SWITCH_THRESHOLD) {
			const totalDelta = this.mouseScrollDelta;
			this.resetMouseScrollState();
			const success = totalDelta > 0 ? this.previousPage() : this.nextPage();
			if (success) {
				this.mouseScrollTimeStamp = currentTime;
			}
		}
	};

	private normalizeWheelDelta(evt: WheelEvent): number {
		let delta = Math.hypot(evt.deltaX, evt.deltaY);
		const angle = Math.atan2(evt.deltaY, evt.deltaX);

		if (-0.25 * Math.PI < angle && angle < 0.75 * Math.PI) {
			delta = -delta;
		}

		if (evt.deltaMode === WheelEvent.DOM_DELTA_LINE) {
			delta *= 30;
		} else if (evt.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
			delta *= 30 * 10;
		}

		return delta / 30;
	}

	private handleMouseDown = (evt: MouseEvent): void => {
		// a link or a widget (animate's player buttons) takes the click; the slide is in a shadow root, so the target is its host
		if (evt.composedPath().some((el) => el instanceof Element && el.matches('.annotationLayer section'))) {
			return;
		}

		// left click = next page, right click = previous page
		if (evt.button === 0) {
			evt.preventDefault();
			if (evt.shiftKey) {
				this.previousPage();
			} else {
				this.nextPage();
			}
		} else if (evt.button === 2) {
			evt.preventDefault();
			this.previousPage();
		}
	};

	private handleKeyDown = (evt: KeyboardEvent): void => {
		if (!this.active) {
			return;
		}

		this.resetMouseScrollState();

		switch (evt.key) {
			case 'ArrowRight':
			case 'ArrowDown':
			case ' ':
			case 'PageDown':
			case 'Enter':
				evt.preventDefault();
				this.nextPage();
				break;
			case 'ArrowLeft':
			case 'ArrowUp':
			case 'PageUp':
			case 'Backspace':
				evt.preventDefault();
				this.previousPage();
				break;
			case 'Home':
				evt.preventDefault();
				this.goToPage(1);
				break;
			case 'End':
				evt.preventDefault();
				this.goToPage(this.totalPages);
				break;
			case 'Escape':
				// the browser handles Escape for fullscreen exit
				break;
		}
	};

	private handleContextMenu = (evt: MouseEvent): void => {
		// right-click is a page-turn (handleMouseDown), so suppress the menu
		evt.preventDefault();
	};

	private handleTouchSwipe = (evt: TouchEvent): void => {
		if (!this.active) {
			return;
		}

		if (evt.touches.length > 1) {
			this.touchSwipeState = null;
			return;
		}

		switch (evt.type) {
			case 'touchstart':
				this.touchSwipeState = {
					startX: evt.touches[0].pageX,
					startY: evt.touches[0].pageY,
					endX: evt.touches[0].pageX,
					endY: evt.touches[0].pageY
				};
				break;
			case 'touchmove':
				if (this.touchSwipeState === null) {
					return;
				}
				this.touchSwipeState.endX = evt.touches[0].pageX;
				this.touchSwipeState.endY = evt.touches[0].pageY;
				evt.preventDefault();
				break;
			case 'touchend': {
				if (this.touchSwipeState === null) {
					return;
				}
				const dx = this.touchSwipeState.endX - this.touchSwipeState.startX;
				const dy = this.touchSwipeState.endY - this.touchSwipeState.startY;
				const absAngle = Math.abs(Math.atan2(dy, dx));

				let delta = 0;
				if (
					Math.abs(dx) > SWIPE_MIN_DISTANCE_THRESHOLD &&
					(absAngle <= SWIPE_ANGLE_THRESHOLD || absAngle >= Math.PI - SWIPE_ANGLE_THRESHOLD)
				) {
					// horizontal swipe
					delta = dx;
				} else if (Math.abs(dy) > SWIPE_MIN_DISTANCE_THRESHOLD && Math.abs(absAngle - Math.PI / 2) <= SWIPE_ANGLE_THRESHOLD) {
					// vertical swipe
					delta = dy;
				}

				if (delta > 0) {
					this.previousPage();
				} else if (delta < 0) {
					this.nextPage();
				}

				this.touchSwipeState = null;
				break;
			}
		}
	};

	private handleResize = (): void => {
		if (this.active) {
			this.renderCurrentPage();
		}
	};

	private resetMouseScrollState(): void {
		this.mouseScrollTimeStamp = 0;
		this.mouseScrollDelta = 0;
	}

	private addWindowListeners(): void {
		if (this.windowAbortController) {
			return;
		}

		this.windowAbortController = new AbortController();
		const { signal } = this.windowAbortController;

		window.addEventListener('mousedown', this.handleMouseDown, { signal });
		window.addEventListener('wheel', this.handleMouseWheel, { passive: false, signal });
		window.addEventListener('keydown', this.handleKeyDown, { signal });
		window.addEventListener('contextmenu', this.handleContextMenu, { signal });
		window.addEventListener('touchstart', this.handleTouchSwipe, { signal });
		window.addEventListener('touchmove', this.handleTouchSwipe, { passive: false, signal });
		window.addEventListener('touchend', this.handleTouchSwipe, { signal });
		window.addEventListener('resize', this.handleResize, { signal });
	}

	private removeWindowListeners(): void {
		this.windowAbortController?.abort();
		this.windowAbortController = null;
	}

	private addFullscreenChangeListeners(): void {
		if (this.fullscreenChangeAbortController) {
			return;
		}

		this.fullscreenChangeAbortController = new AbortController();

		window.addEventListener(
			'fullscreenchange',
			() => {
				if (document.fullscreenElement) {
					this.enter();
				} else {
					this.doExit();
				}
			},
			{ signal: this.fullscreenChangeAbortController.signal }
		);
	}

	private removeFullscreenChangeListeners(): void {
		this.fullscreenChangeAbortController?.abort();
		this.fullscreenChangeAbortController = null;
	}
}
