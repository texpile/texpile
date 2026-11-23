// one view's line-breaking state (C1's ViewBreaking): the lines kept while typing and the document's hyphenation patterns
import type { Node as PMNode } from 'prosemirror-model';
import type { EditorState } from 'prosemirror-state';
import { KeptBreaks } from '../inline/keptBreaks';
import type { DocumentHyphenation } from './documentHyphenationLanguage';
import { loadHyphenator, readyHyphenator, type HyphenationLanguage } from './hyphenationLanguages';
import type { Hyphenator } from './liangHyphenation';

// a document that names no language is hyphenated as American English, as the DOM editor did
const DEFAULT_LANGUAGE: HyphenationLanguage = 'en-us';

export class ViewLineBreaking {
	readonly kept = new KeptBreaks();
	private language: HyphenationLanguage | null = null;
	private patterns: Hyphenator | null = null;
	private loading: Promise<void> | null = null;
	private readonly listeners = new Set<() => void>();

	/** languageOf: the open document's language (templateFeaturesStore's hyphenationLanguage) */
	constructor(private readonly languageOf: () => DocumentHyphenation | undefined) {}

	/** null while the patterns load and for a language without any */
	get hyphenator(): Hyphenator | null {
		this.follow();
		return this.patterns;
	}

	update(before: EditorState, state: EditorState): readonly PMNode[] {
		return this.kept.update(before, state);
	}

	compose(preedit: { readonly from: number; readonly to: number } | null): void {
		this.kept.composition = preedit && { from: preedit.from, to: preedit.to };
	}

	/** the patterns arrived after blocks were broken without them: every block breaks again */
	onPatterns(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	/** the current language's patterns while they load, null once they are in */
	patternsLoading(): Promise<void> | null {
		this.follow();
		return this.loading;
	}

	private follow(): void {
		const wanted = this.languageOf() ?? DEFAULT_LANGUAGE;
		const language = wanted === 'none' ? null : wanted;
		if (language === this.language) return;
		this.language = language;
		this.patterns = language ? (readyHyphenator(language) ?? null) : null;
		this.loading = null;
		if (!language || this.patterns) return;
		// a file that fails to load leaves the language unhyphenated, as one without patterns
		const loading = loadHyphenator(language)
			.then(
				(patterns) => {
					if (this.language !== language) return;
					this.patterns = patterns;
					for (const listener of this.listeners) listener();
				},
				() => {}
			)
			.finally(() => {
				if (this.loading === loading) this.loading = null;
			});
		this.loading = loading;
	}
}
