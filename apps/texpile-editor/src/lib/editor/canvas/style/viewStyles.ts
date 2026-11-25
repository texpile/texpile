// one view's styles: the resolver over the core base, the theme tokens read under the view's root, and the epochs
import type { ViewStyles, ViewStylesSetup } from '../contracts/engineTypes';
import type { ComputedStyle, ElementState, Rgba, RunChain, RunStyle, ThemeToken } from '../contracts/styleTypes';
import type { FaceElement } from '../tree/faceElement';
import type { BaseSettings } from './base/baseTypes';

type GeneratedPart = 'before' | 'after' | 'marker';
const GENERATED_FIELDS = { before: 'generatedBefore', after: 'generatedAfter', marker: 'generatedMarker' } as const;
import { createStyleBase } from './base/styleBase';
import { CanvasStyleResolver } from './canvasStyles';
import { StyleEpoch, type StyleSettings } from './theme/styleEpoch';
import { groundOf, ThemeTokens } from './theme/themeTokens';

export class CanvasViewStyles implements ViewStyles {
	readonly tokens: ThemeTokens;
	readonly epochs: StyleEpoch;
	/** ms resolving element styles; the theme reads below are left out */
	styleMs = 0;
	/** ms in the theme token probe and the ground read: the browser's own style recalculation of the page */
	themeReadMs = 0;
	private readonly resolver: CanvasStyleResolver;
	private readonly observer: MutationObserver;
	private depth = 0;
	private readBefore = 0;
	private settings: { readonly epoch: number; readonly base: BaseSettings } | null = null;
	private groundRead: { readonly epoch: number; readonly color: Rgba | null } | null = null;
	private groundReads = 0;

	constructor(private readonly setup: ViewStylesSetup) {
		const { root } = setup;
		const win = root.ownerDocument.defaultView!;
		this.tokens = new ThemeTokens(root);
		this.epochs = new StyleEpoch(root.ownerDocument, this.tokens);
		const { epochs, tokens } = this;
		this.resolver = new CanvasStyleResolver({
			base: createStyleBase({ nodeOf: setup.nodeOf, doc: setup.doc }, () => this.baseSettings()),
			tokens: tokens.declaredText,
			// only the theme and the settings change a style: a font load relays and repaints, and resolves nothing again
			epochs: {
				get epoch() {
					return epochs.styles;
				},
				get paintEpoch() {
					return epochs.styles;
				}
			},
			remPx: () => tokens.remPx(),
			layoutChanged: () => epochs.bump('layout'),
			dark: () => tokens.dark(),
			viewport: () => ({ width: win.innerWidth, height: win.innerHeight })
		});
		// page view and read only are classes the app toggles on the root
		this.observer = new win.MutationObserver(() => this.checkSettings());
		this.observer.observe(root, { attributes: true, attributeFilter: ['class'] });
		this.checkSettings();
	}

	get epoch(): number {
		return this.epochs.layout;
	}

	get paintEpoch(): number {
		return this.epochs.paint;
	}

	get reads(): number {
		return this.tokens.reads + this.groundReads;
	}

	/** D17: the opaque ground the rows paint, read again only when the theme can have changed it */
	ground(): Rgba | null {
		const epoch = this.epochs.styles;
		if (this.groundRead?.epoch !== epoch) {
			this.groundReads++;
			const start = performance.now();
			this.groundRead = { epoch, color: groundOf(this.setup.root) };
			this.themeReadMs += performance.now() - start;
		}
		return this.groundRead.color;
	}

	styleOf(el: FaceElement, pseudo?: GeneratedPart): ComputedStyle | null {
		if (pseudo && !el[GENERATED_FIELDS[pseudo]]) return null;
		const start = this.begin();
		try {
			return this.resolver.styleOf(el, pseudo);
		} finally {
			this.end(start);
		}
	}

	runStyle(block: FaceElement, chain: RunChain): RunStyle {
		const start = this.begin();
		try {
			return this.resolver.runStyle(block, chain);
		} finally {
			this.end(start);
		}
	}

	rootStyle(): ComputedStyle {
		const start = this.begin();
		try {
			return this.resolver.rootStyle();
		} finally {
			this.end(start);
		}
	}

	current(style: ComputedStyle): ComputedStyle {
		const start = this.begin();
		try {
			return this.resolver.current(style);
		} finally {
			this.end(start);
		}
	}

	currentRun(run: RunStyle): RunStyle {
		const start = this.begin();
		try {
			return this.resolver.currentRun(run);
		} finally {
			this.end(start);
		}
	}

	setState(el: FaceElement, state: ElementState, on: boolean): void {
		this.resolver.setState(el, state, on);
	}

	markSelectedNode(el: FaceElement, on: boolean): void {
		this.resolver.markSelectedNode(el, on);
	}

	token(name: ThemeToken): Rgba {
		return this.resolver.token(name);
	}

	onEpoch(listener: () => void): () => void {
		return this.epochs.onBump(() => listener());
	}

	checkEpoch(): void {
		this.epochs.check();
		this.checkSettings();
	}

	destroy(): void {
		this.observer.disconnect();
		this.epochs.destroy();
	}

	/** read once per epoch: the base asks for them on every heading */
	private baseSettings(): BaseSettings {
		const { setup, epochs } = this;
		if (this.settings?.epoch === epochs.styles) return this.settings.base;
		const base: BaseSettings = {
			language: setup.language(),
			pageView: setup.pageView(),
			readOnly: setup.readOnly(),
			viewportWidth: setup.root.ownerDocument.defaultView!.innerWidth,
			editorFont: this.tokens.editorFont()
		};
		this.settings = { epoch: epochs.styles, base };
		return base;
	}

	private checkSettings(): void {
		const { setup } = this;
		const face = setup.settings();
		const settings: StyleSettings = {
			justify: face.justify,
			hyphenate: face.hyphenate,
			pageView: setup.pageView(),
			readOnly: setup.readOnly(),
			viewportWidth: setup.root.ownerDocument.defaultView!.innerWidth
		};
		this.epochs.setSettings(settings);
	}

	/** the outermost call's start, else -1: nested calls are inside its time */
	private begin(): number {
		if (this.depth++) return -1;
		this.readBefore = this.tokens.readMs;
		return performance.now();
	}

	private end(start: number): void {
		this.depth--;
		if (start < 0) return;
		const readMs = this.tokens.readMs - this.readBefore;
		this.themeReadMs += readMs;
		this.styleMs += performance.now() - start - readMs;
	}
}
