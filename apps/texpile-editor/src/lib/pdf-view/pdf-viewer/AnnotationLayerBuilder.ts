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

/** renders PDF annotations (links, form widgets, popups); adapted from PDF.js annotation_layer_builder.js. */
import type { PDFPageProxy, PageViewport } from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { SimpleLinkService } from './SimpleLinkService';
import { keepScriptedVisibility, type FormScripting } from './PdfScripting';

let AnnotationLayer: typeof import('pdfjs-dist/legacy/build/pdf.mjs').AnnotationLayer;

async function ensurePdfJsLoaded() {
	if (!AnnotationLayer) {
		const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
		AnnotationLayer = pdfjs.AnnotationLayer;
	}
}

export type AnnotationLayerBuilderOptions = {
	pdfPage: PDFPageProxy;
	linkService: SimpleLinkService;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	annotationStorage?: any;
	imageResourcesPath?: string;
	renderForms?: boolean;
	forms?: FormScripting | null;
	annotationCanvasMap?: Map<string, HTMLCanvasElement>;
	onAppend?: (div: HTMLDivElement) => void;
};

export type AnnotationLayerBuilderRenderOptions = {
	viewport: PageViewport;
	intent?: string;
};

export class AnnotationLayerBuilder {
	private pdfPage: PDFPageProxy;
	private linkService: SimpleLinkService;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	private annotationStorage: any;
	private imageResourcesPath: string;
	private renderForms: boolean;
	private forms: FormScripting | null;
	private annotationCanvasMap: Map<string, HTMLCanvasElement> | null;
	private onAppend: ((div: HTMLDivElement) => void) | null;

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	private annotationLayer: any = null;
	div: HTMLDivElement | null = null;
	private cancelled = false;

	constructor(options: AnnotationLayerBuilderOptions) {
		this.pdfPage = options.pdfPage;
		this.linkService = options.linkService;
		this.forms = options.forms ?? null;
		this.annotationCanvasMap = options.annotationCanvasMap ?? null;
		this.annotationStorage = options.annotationStorage ?? this.forms?.annotationStorage ?? null;
		this.imageResourcesPath = options.imageResourcesPath ?? '';
		this.renderForms = options.renderForms ?? true;
		this.onAppend = options.onAppend ?? null;
	}

	async render(options: AnnotationLayerBuilderRenderOptions): Promise<void> {
		const { viewport, intent = 'display' } = options;

		if (this.div) {
			if (this.cancelled || !this.annotationLayer) {
				return;
			}
			this.annotationLayer.update({
				viewport: viewport.clone({ dontFlip: true })
			});
			return;
		}

		await ensurePdfJsLoaded();

		const annotations = await this.pdfPage.getAnnotations({ intent });
		if (this.cancelled) {
			return;
		}

		this.div = document.createElement('div');
		this.div.className = 'annotationLayer';
		this.onAppend?.(this.div);

		// set dimensions directly: setLayerDimensions uses CSS round(), which may not work everywhere
		const { width, height } = viewport;
		this.div.style.width = `${Math.floor(width)}px`;
		this.div.style.height = `${Math.floor(height)}px`;

		this.annotationLayer = new AnnotationLayer({
			div: this.div,
			accessibilityManager: null,
			annotationCanvasMap: this.annotationCanvasMap,
			annotationEditorUIManager: null,
			page: this.pdfPage,
			viewport: viewport.clone({ dontFlip: true }),
			structTreeLayer: null,
			commentManager: null,
			linkService: this.linkService,
			annotationStorage: this.annotationStorage
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
		} as any);

		if (annotations.length === 0) {
			return;
		}

		await this.annotationLayer.render({
			annotations,
			imageResourcesPath: this.imageResourcesPath,
			renderForms: this.renderForms,
			linkService: this.linkService,
			downloadManager: undefined,
			annotationStorage: this.annotationStorage,
			enableScripting: this.forms?.enableScripting ?? false,
			hasJSActions: this.forms?.hasJSActions ?? false,
			fieldObjects: this.forms?.fieldObjects ?? null
		});
		keepScriptedVisibility(this.div, this.forms);
	}

	update(viewport: PageViewport): void {
		if (!this.div || !this.annotationLayer) {
			return;
		}
		this.annotationLayer.update({
			viewport: viewport.clone({ dontFlip: true })
		});
	}

	cancel(): void {
		this.cancelled = true;
	}

	hide(): void {
		if (this.div) {
			this.div.hidden = true;
		}
	}

	show(): void {
		if (this.div) {
			this.div.hidden = false;
		}
	}

	destroy(): void {
		this.cancel();
		if (this.div) {
			this.div.remove();
			this.div = null;
		}
		this.annotationLayer = null;
	}
}
