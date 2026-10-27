import { language, type LRLanguage } from '@codemirror/language';
import { Prec, StateEffect, StateField, type EditorState, type Extension } from '@codemirror/state';
import { ViewPlugin, type EditorView, type ViewUpdate } from '@codemirror/view';
import { docText } from '$lib/editor/source/docText';
import { projectIntelStore, type ProjectIntel } from '$lib/stores/projectIntel';
import { onUserDefinitions, userDefinitionsOf } from '../intellisense/completion/macros';
import type { UserDefinitions } from '../intellisense/completion/userMacroScan';
import { latexLanguage } from './latexLanguage';
import { NO_OWN_MATH, ownMathKey, ownMathOf, ownMathTokensKey, type OwnMath } from '../syntax/ownMath';
import { verbatimTokens, verbatimTokensFor } from '../syntax/verbatimTokens';

const RESCAN_DELAY_MS = 400;
const NO_OWN_MATH_KEY = ownMathTokensKey(NO_OWN_MATH);

export const setOwnMath = StateEffect.define<OwnMath>();

const ownMathField = StateField.define<OwnMath>({
	create: () => NO_OWN_MATH,
	update: (own, tr) => tr.effects.reduce((value, effect) => (effect.is(setOwnMath) ? effect.value : value), own)
});

export function ownMathIn(state: EditorState): OwnMath {
	return state.field(ownMathField, false) ?? NO_OWN_MATH;
}

const languages = new Map<string, LRLanguage>();

function languageFor(own: OwnMath): LRLanguage {
	const key = ownMathTokensKey(own);
	if (key === NO_OWN_MATH_KEY) return latexLanguage;
	let found = languages.get(key);
	if (!found) {
		found = latexLanguage.configure({ tokenizers: [{ from: verbatimTokens, to: verbatimTokensFor(own) }] });
		languages.set(key, found);
	}
	return found;
}

const ownMathWatcher = ViewPlugin.fromClass(
	class {
		timer: ReturnType<typeof setTimeout> | undefined;
		scanned: { definitions: UserDefinitions; intel: ProjectIntel; own: OwnMath } | null = null;
		stopListening: () => void;
		constructor(readonly view: EditorView) {
			this.stopListening = onUserDefinitions(() => this.schedule());
			this.schedule();
		}
		update(update: ViewUpdate) {
			if (update.docChanged) this.schedule();
		}
		schedule() {
			clearTimeout(this.timer);
			this.timer = setTimeout(() => this.refresh(), RESCAN_DELAY_MS);
		}
		refresh() {
			const { state } = this.view;
			const definitions = userDefinitionsOf(docText(state.doc));
			if (!definitions) return;
			const intel = projectIntelStore.current;
			if (this.scanned?.definitions !== definitions || this.scanned.intel !== intel)
				this.scanned = { definitions, intel, own: ownMathOf(definitions, intel) };
			const own = this.scanned.own;
			if (ownMathKey(own) !== ownMathKey(ownMathIn(state))) this.view.dispatch({ effects: setOwnMath.of(own) });
		}
		destroy() {
			clearTimeout(this.timer);
			this.stopListening();
		}
	}
);

export function latexOwnMath(): Extension {
	return [ownMathField, Prec.highest(language.compute([ownMathField], (state) => languageFor(state.field(ownMathField)))), ownMathWatcher];
}
