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

/** runs a PDF's own JavaScript (form scripts, the animate package's player) in pdf.js's QuickJS sandbox; derivative work based on PDF.js pdf_scripting_manager.js */
import type { PDFDocumentProxy } from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { EventBus } from './EventBus';
import { PDF_SANDBOX_DIR } from './pdfSandboxDir';

/** pdf.js AnnotationMode.ENABLE_FORMS: widgets a script hides are drawn too, on canvases of their own */
export const ANNOTATION_MODE_FORMS = 2;

export type FormScripting = {
	annotationStorage: PDFDocumentProxy['annotationStorage'];
	enableScripting: boolean;
	hasJSActions: boolean;
	fieldObjects: Map<string, object[]> | null;
};

/** a rebuilt layer starts from the PDF's own flags; a widget the script showed or hid keeps that */
export function keepScriptedVisibility(layer: HTMLElement, forms: FormScripting | null): void {
	if (!forms?.enableScripting) return;
	for (const section of layer.querySelectorAll<HTMLElement>('section[data-annotation-id]')) {
		const stored = forms.annotationStorage.getRawValue(section.dataset.annotationId ?? '') as { noView?: boolean } | undefined;
		if (stored?.noView !== undefined) section.style.visibility = stored.noView ? 'hidden' : 'visible';
	}
}

type Sandbox = {
	create(init: object): void;
	dispatchEvent(event: unknown): void;
	nukeSandbox(): void;
	support: { win: object };
};

type SandboxUpdate = { id?: string; siblings?: string[]; command?: string; value?: unknown } & Record<string, unknown>;

/** what pdf.js hands the sandbox from the window; the updates go to this viewer alone, and dialogs stay closed */
function sandboxWindow(events: EventTarget): object {
	return {
		CustomEvent,
		URL,
		console,
		setTimeout: setTimeout.bind(window),
		clearTimeout: clearTimeout.bind(window),
		setInterval: setInterval.bind(window),
		clearInterval: clearInterval.bind(window),
		alert: (message: unknown) => console.warn('PDF alert:', message),
		confirm: () => false,
		prompt: () => null,
		dispatchEvent: (event: Event) => events.dispatchEvent(event)
	};
}

async function docProperties(doc: PDFDocumentProxy) {
	const meta = await doc.getMetadata();
	return {
		...meta.info,
		baseURL: '',
		filesize: 0,
		filename: '',
		metadata: meta.metadata?.getRaw(),
		authors: meta.metadata?.get('dc:creator'),
		numPages: doc.numPages,
		URL: ''
	};
}

export class PdfScripting {
	private doc: PDFDocumentProxy | null = null;
	private sandbox: Sandbox | null = null;
	private objectIds = new Set<string>();
	private openedPages = new Set<number>();
	private readonly events = new EventTarget();

	constructor(
		private readonly eventBus: EventBus,
		private readonly root: HTMLElement
	) {
		this.events.addEventListener('updatefromsandbox', (e) => this.update((e as CustomEvent<SandboxUpdate>).detail));
		eventBus.on('dispatcheventinsandbox', (e) => this.dispatch(e.detail));
		eventBus.on('pagerendered', (e) => void this.openPage(e.pageNumber as number));
	}

	/** what the annotation layers need before the sandbox is up */
	async formsOf(doc: PDFDocumentProxy): Promise<FormScripting> {
		const [fieldObjects, jsActions] = await Promise.all([doc.getFieldObjects(), doc.hasJSActions()]);
		return {
			annotationStorage: doc.annotationStorage,
			enableScripting: !!fieldObjects || jsActions,
			hasJSActions: jsActions,
			fieldObjects
		};
	}

	/** after close(), and before the document's pages render */
	async open(doc: PDFDocumentProxy, forms: FormScripting): Promise<void> {
		if (!forms.enableScripting) return;
		this.doc = doc;
		for (const fields of forms.fieldObjects?.values() ?? []) for (const field of fields) this.objectIds.add((field as { id: string }).id);
		const [calculationOrder, actions, properties] = await Promise.all([
			doc.getCalculationOrderIds(),
			doc.getJSActions(),
			docProperties(doc)
		]);
		if (doc !== this.doc) return;
		const { QuickJSSandbox } = await import('pdfjs-dist/legacy/build/pdf.sandbox.mjs');
		const sandbox = (await QuickJSSandbox(new URL(`${PDF_SANDBOX_DIR}/`, document.baseURI).href)) as Sandbox;
		if (doc !== this.doc) return sandbox.nukeSandbox();
		sandbox.support.win = sandboxWindow(this.events);
		try {
			sandbox.create({
				objects: forms.fieldObjects,
				calculationOrder,
				appInfo: { platform: navigator.platform, language: navigator.language },
				docInfo: { ...properties, actions }
			});
		} catch (error) {
			console.error('PDF scripts:', error);
			return;
		}
		this.sandbox = sandbox;
		this.dispatch({ id: 'doc', name: 'Open' });
		for (const page of this.openedPages) void this.openPage(page, true);
	}

	close(): void {
		this.sandbox?.nukeSandbox();
		this.sandbox = null;
		this.doc = null;
		this.objectIds.clear();
		this.openedPages.clear();
	}

	private async openPage(pageNumber: number, again = false): Promise<void> {
		if (!again && this.openedPages.has(pageNumber)) return;
		this.openedPages.add(pageNumber);
		const doc = this.doc;
		if (!doc || !this.sandbox) return;
		const actions = await (await doc.getPage(pageNumber)).getJSActions();
		if (doc === this.doc) this.dispatch({ id: 'page', name: 'PageOpen', pageNumber, actions });
	}

	private dispatch(event: unknown): void {
		const sandbox = this.sandbox;
		if (sandbox) setTimeout(() => sandbox.dispatchEvent(event), 0);
	}

	private update(detail: SandboxUpdate): void {
		const { id, siblings, command, value, ...change } = detail;
		if (!id) {
			if (command === 'error') console.error('PDF scripts:', value);
			else if (command === 'println') console.log('PDF scripts:', value);
			return;
		}
		for (const elementId of siblings ? [id, ...siblings] : [id]) {
			if (!this.objectIds.has(elementId)) continue;
			const element = this.root.querySelector(`[data-element-id="${CSS.escape(elementId)}"]`);
			if (element) element.dispatchEvent(new CustomEvent('updatefromsandbox', { detail: change }));
			else this.doc?.annotationStorage.setValue(elementId, change);
		}
	}
}
