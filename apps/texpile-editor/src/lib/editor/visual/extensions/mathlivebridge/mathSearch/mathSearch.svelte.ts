// The math search's state: one panel for the window, opened in an equation and listing everything
// MathLive has for the equation's syntax. The equation keeps the focus throughout, so a pick goes in
// at its caret.
import type { MathfieldElement } from 'mathlive';
import { insertSymbol } from '$lib/editor/visual/toolbar/mathInsert';
import { offerPackageFor } from '$lib/languages/latex/symbols/latexSymbolPackage';
import type { LatexSymbol } from '$lib/languages/latex/symbols/latexSymbol.types';
import { m } from '$lib/paraglide/messages';
import type { MathSyntax } from '../mathFieldFactory';
import { mathStructures, searchStructures, type MathStructure } from './mathStructures';
import { loadMathEntries, searchMathEntries, type MathEntries, type MathEntry } from './mathEntries';

export type MathSearchResult = { section: string } & (
	{ kind: 'structure'; structure: MathStructure } | { kind: 'entry'; entry: MathEntry }
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
		const loaded = this.loaded;
		if (!loaded) return found;
		if (query) return [...found, ...searchMathEntries(loaded, query).map((e) => entryIn(m.mathsearch_matches(), e))];
		// with nothing typed: what was picked lately, then everything there is
		const recent = loaded.set
			.recent()
			.map((id) => loaded.bySymbol.get(id))
			.filter((e): e is MathEntry => e !== undefined)
			.map((e) => entryIn(m.symbols_group_recent(), e));
		return [...recent, ...found, ...loaded.entries.map((e) => entryIn(e.section, e))];
	});

	open(field: MathfieldElement, syntax: MathSyntax): void {
		this.field = field;
		this.syntax = syntax;
		this.query = '';
		this.active = 0;
		this.place = placeUnder(field);
		this.loaded = this.ready.get(syntax) ?? null;
		if (!this.loaded)
			void loadMathEntries(syntax).then((loaded) => {
				this.ready.set(syntax, loaded);
				if (this.field === field) this.loaded = loaded;
			});
		field.addEventListener('blur', this.close, { once: true });
	}

	close = (): void => {
		this.field?.removeEventListener('blur', this.close);
		this.field = null;
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
		const { field, syntax, loaded } = this;
		this.close();
		if (!result || !field) return;
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

function placeUnder(field: MathfieldElement): MathSearchPlace {
	const box = field.getBoundingClientRect();
	// MathLive draws its caret in the field's own tree and has no public way to say where it is
	const caret = field.shadowRoot?.querySelector('.ML__caret')?.getBoundingClientRect();
	const left = Math.max(8, Math.min((caret?.left ?? box.left) - 16, window.innerWidth - PANEL_WIDTH - 8));
	if (window.innerHeight - box.bottom >= PANEL_ROOM || box.top < PANEL_ROOM) return { left, top: box.bottom + 4 };
	return { left, bottom: window.innerHeight - box.top + 4 };
}

export const mathSearch = new MathSearchState();
