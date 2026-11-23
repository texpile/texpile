import { watchFontLoads } from '../../layout/text/fontLoading';
import { MARKDOWN_BREAKPOINT } from '../base/baseTypes';
import type { ThemeTokens } from './themeTokens';

export type StyleEpochReason = 'attributes' | 'sheets' | 'media' | 'resolution' | 'zoom' | 'fonts' | 'layout' | 'settings';
/** colors change; layout too when a length, font or text token differs */
const THEME_REASONS: ReadonlySet<StyleEpochReason> = new Set(['attributes', 'sheets', 'media']);
/** what can change a declared or computed value; fonts, resolution, zoom and a relayout change only what layout measures */
const STYLE_REASONS: ReadonlySet<StyleEpochReason> = new Set([...THEME_REASONS, 'settings']);

/** the settings a style reads: Justify, Hyphenate, page view, read only and the window width Markdown headings follow */
export type StyleSettings = {
	readonly justify: boolean;
	readonly hyphenate: boolean;
	readonly pageView: boolean;
	readonly readOnly: boolean;
	readonly viewportWidth: number;
};

const WATCHED_ATTRIBUTES = ['data-mode', 'data-theme', 'class', 'style'];

function sameSettings(one: StyleSettings, two: StyleSettings): boolean {
	return (
		one.justify === two.justify &&
		one.hyphenate === two.hyphenate &&
		one.pageView === two.pageView &&
		one.readOnly === two.readOnly &&
		one.viewportWidth < MARKDOWN_BREAKPOINT === two.viewportWidth < MARKDOWN_BREAKPOINT
	);
}

export class StyleEpoch {
	private layoutValue = 0;
	private paintValue = 0;
	private stylesValue = 0;
	private settings: StyleSettings | null = null;
	private readonly listeners = new Set<(reason: StyleEpochReason) => void>();
	private readonly observer: MutationObserver;
	private readonly cleanups: (() => void)[] = [];
	private dark: { list: MediaQueryList; listener: () => void };
	private resolution: { list: MediaQueryList; listener: () => void } | null = null;
	private adopted: readonly CSSStyleSheet[] = [];

	constructor(
		private readonly doc: Document,
		private readonly tokens: ThemeTokens
	) {
		const view = doc.defaultView!;
		this.observer = new view.MutationObserver((records) => {
			// a write of the value already there (a setting's effect running again) changes nothing
			const changed = records.filter((r) => r.type !== 'attributes' || (r.target as Element).getAttribute(r.attributeName!) !== r.oldValue);
			if (changed.length) this.bump(changed.some((r) => r.type !== 'attributes') ? 'sheets' : 'attributes');
		});
		const watched = { attributes: true, attributeOldValue: true, attributeFilter: WATCHED_ATTRIBUTES };
		this.observer.observe(doc.documentElement, watched);
		if (doc.body) this.observer.observe(doc.body, watched);
		this.observer.observe(doc.head, { childList: true, subtree: true, characterData: true });
		// a theme preset's <link> is added before its sheet loads, so the mutation above reads the old tokens
		const sheetLoaded = (event: Event): void => {
			if (event.target instanceof view.HTMLLinkElement) this.bump('sheets');
		};
		doc.head.addEventListener('load', sheetLoaded, true);
		this.cleanups.push(() => doc.head.removeEventListener('load', sheetLoaded, true));
		this.adopted = [...(doc.adoptedStyleSheets ?? [])];
		const list = view.matchMedia('(prefers-color-scheme: dark)');
		const listener = (): void => this.bump('media');
		list.addEventListener('change', listener);
		this.dark = { list, listener };
		this.watchResolution();
		if (doc.fonts) this.cleanups.push(watchFontLoads(doc.fonts, () => this.bump('fonts')));
	}

	/** layout: every cached layout half is stale */
	get layout(): number {
		return this.layoutValue;
	}

	/** every bump: colors are read again */
	get paint(): number {
		return this.paintValue;
	}

	/** a bump that can change a resolved style: the theme and the settings */
	get styles(): number {
		return this.stylesValue;
	}

	onBump(listener: (reason: StyleEpochReason) => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	/** a theme reason reads the tokens and bumps layout only when a length, font or text token differs */
	bump(reason: StyleEpochReason): void {
		const theme = THEME_REASONS.has(reason) ? this.tokens.read() : null;
		// the canvas reads the theme through its tokens alone: a class or a sheet that moved none of them changes nothing
		if (theme && !theme.paint && !theme.layout && reason !== 'media') return;
		this.paintValue++;
		if (STYLE_REASONS.has(reason)) this.stylesValue++;
		if (!theme || theme.layout) this.layoutValue++;
		for (const listener of this.listeners) listener(reason);
	}

	setSettings(next: StyleSettings): void {
		const old = this.settings;
		this.settings = next;
		if (old && !sameSettings(old, next)) this.bump('settings');
	}

	/** per frame: a custom theme replaces the adopted sheets with no event */
	check(): void {
		const now = this.doc.adoptedStyleSheets ?? [];
		if (now.length === this.adopted.length && now.every((sheet, i) => sheet === this.adopted[i])) return;
		this.adopted = [...now];
		this.bump('sheets');
	}

	private watchResolution(): void {
		const view = this.doc.defaultView!;
		this.resolution?.list.removeEventListener('change', this.resolution.listener);
		const list = view.matchMedia(`(resolution: ${view.devicePixelRatio}dppx)`);
		const listener = (): void => {
			this.watchResolution();
			this.bump('resolution');
		};
		list.addEventListener('change', listener);
		this.resolution = { list, listener };
	}

	destroy(): void {
		this.observer.disconnect();
		this.dark.list.removeEventListener('change', this.dark.listener);
		this.resolution?.list.removeEventListener('change', this.resolution.listener);
		for (const cleanup of this.cleanups) cleanup();
		this.listeners.clear();
	}
}
