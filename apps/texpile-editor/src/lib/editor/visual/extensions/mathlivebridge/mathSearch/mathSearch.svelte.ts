// The math search's state: one panel for the window, opened in an equation and listing everything
// MathLive has for the equation's syntax. The equation keeps the focus throughout, so a pick goes in
// at its caret.
import type { MathfieldElement } from 'mathlive';
import type { EditorView as CMView } from '@codemirror/view';
import { indentAtCaret } from '$lib/editor/source/extensions/keybindings/cmTabKey';
import { insertIntoSource } from '$lib/editor/source/extensions/math-search/sourceMathInsert';
import { insertSymbol } from '$lib/editor/visual/toolbar/mathInsert';
import { offerPackageFor } from '$lib/languages/latex/symbols/latexSymbolPackage';
import type { LatexSymbol } from '$lib/languages/latex/symbols/latexSymbol.types';
import { m } from '$lib/paraglide/messages';
import type { MathSyntax } from '../mathFieldFactory';
import { mathStructures, searchStructures, type MathStructure } from './mathStructures';
import { loadMathEntries, searchMathEntries, type MathEntries, type MathEntry } from './mathEntries';

export type MathSearchResult = { section: string } & (
	| { kind: 'structure'; structure: MathStructure }
	| { kind: 'entry'; entry: MathEntry }
	/** the source editor's way to the indent Tab no longer types inside math */
	| { kind: 'tab' }
);

/** where the panel sits: under the caret, or above it when there is no room below */
export type MathSearchPlace = { left: number; top?: number; bottom?: number };

const PANEL_WIDTH = 320;
const PANEL_ROOM = 400;

let structures: MathStructure[] | null = null;

function entryIn(section: string, entry: MathEntry): MathSearchResult {
	return { kind: 'entry', entry, section };
}

class MathSearchState {
	field = $state.raw<MathfieldElement | null>(null);
	/** the source editor it was opened in, when it was not an equation's field */
	source = $state.raw<CMView | null>(null);
	syntax = $state<MathSyntax>('latex');
	query = $state('');
	active = $state(0);
	place = $state<MathSearchPlace | null>(null);
	loaded = $state.raw<MathEntries | null>(null);
	private ready = new Map<MathSyntax, MathEntries>();

	readonly results = $derived.by((): MathSearchResult[] => {
		const query = this.query.trim();
		const found = searchStructures((structures ??= mathStructures()), query).map((structure): MathSearchResult => ({
			kind: 'structure',
			structure,
			section: m.mathsearch_structures()
		}));
		const tab: MathSearchResult[] = this.source && !query ? [{ kind: 'tab', section: '' }] : [];
		const loaded = this.loaded;
		if (!loaded) return [...tab, ...found];
		if (query) return [...found, ...searchMathEntries(loaded, query).map((e) => entryIn(m.mathsearch_matches(), e))];
		// with nothing typed: what was picked lately, then everything there is
		const recent = loaded.set
			.recent()
			.map((id) => loaded.bySymbol.get(id))
			.filter((e): e is MathEntry => e !== undefined)
			.map((e) => entryIn(m.symbols_group_recent(), e));
		return [...tab, ...recent, ...found, ...loaded.entries.map((e) => entryIn(e.section, e))];
	});

	get showing(): boolean {
		return (this.field !== null || this.source !== null) && this.place !== null;
	}

	open(field: MathfieldElement, syntax: MathSyntax): void {
		this.field = field;
		this.start(syntax, placeUnder(field));
		field.addEventListener('blur', this.close, { once: true });
	}

	/** from Tab inside math in the source editor, which is LaTeX or Markdown's LaTeX math */
	openSource(view: CMView): void {
		this.source = view;
		const caret = view.coordsAtPos(view.state.selection.main.head);
		this.start('latex', caret ? placeAt(caret.left, caret.top, caret.bottom) : null);
		view.contentDOM.addEventListener('blur', this.close, { once: true });
	}

	private start(syntax: MathSyntax, place: MathSearchPlace | null): void {
		this.syntax = syntax;
		this.query = '';
		this.active = 0;
		this.place = place;
		this.loaded = this.ready.get(syntax) ?? null;
		if (!this.loaded)
			void loadMathEntries(syntax).then((loaded) => {
				this.ready.set(syntax, loaded);
				if (this.syntax === syntax) this.loaded = loaded;
			});
	}

	close = (): void => {
		this.field?.removeEventListener('blur', this.close);
		this.source?.contentDOM.removeEventListener('blur', this.close);
		this.field = null;
		this.source = null;
		this.place = null;
	};

	type(text: string): void {
		this.query += text;
		this.active = 0;
	}

	/** false once there is nothing left to take back */
	backspace(): boolean {
		if (!this.query) return false;
		this.query = this.query.slice(0, -1);
		this.active = 0;
		return true;
	}

	move(step: number): void {
		const count = this.results.length;
		if (count) this.active = Math.max(0, Math.min(count - 1, this.active + step));
	}

	pick(index = this.active): void {
		const result = this.results[index];
		const { field, source, syntax, loaded } = this;
		this.close();
		if (!result) return;
		if (source) return pickInSource(source, result, loaded);
		if (!field || result.kind === 'tab') return;
		if (result.kind === 'structure') {
			insertSymbol(result.structure.latex);
			return;
		}
		const { command, symbol } = result.entry;
		// a Typst call is typed, as its name and `(`, so it opens with the caret in it; the space first
		// ends a name typed before the search opened, which the call would otherwise run on from
		if (command.typed) for (const key of ` ${command.insert}`) field.executeCommand(['typedText', key, { simulateKeystroke: true }]);
		else insertSymbol(command.insert, syntax);
		if (!symbol || !loaded) return;
		loaded.set.remember(symbol.id);
		if (syntax === 'latex') offerPackageFor(symbol as LatexSymbol);
	}
}

function pickInSource(view: CMView, result: MathSearchResult, loaded: MathEntries | null): void {
	if (result.kind === 'tab') {
		indentAtCaret(view);
		return;
	}
	if (result.kind === 'structure') return insertIntoSource(view, result.structure.latex);
	insertIntoSource(view, result.entry.command.insert);
	const { symbol } = result.entry;
	if (!symbol || !loaded) return;
	loaded.set.remember(symbol.id);
	offerPackageFor(symbol as LatexSymbol);
}

function placeUnder(field: MathfieldElement): MathSearchPlace {
	const box = field.getBoundingClientRect();
	// MathLive draws its caret in the field's own tree and has no public way to say where it is
	const caret = field.shadowRoot?.querySelector('.ML__caret')?.getBoundingClientRect();
	return placeAt(caret?.left ?? box.left, box.top, box.bottom);
}

/** under the line from `top` to `bottom`, or above it when there is no room below */
function placeAt(caretLeft: number, top: number, bottom: number): MathSearchPlace {
	const left = Math.max(8, Math.min(caretLeft - 16, window.innerWidth - PANEL_WIDTH - 8));
	if (window.innerHeight - bottom >= PANEL_ROOM || top < PANEL_ROOM) return { left, top: bottom + 4 };
	return { left, bottom: window.innerHeight - top + 4 };
}

export const mathSearch = new MathSearchState();
