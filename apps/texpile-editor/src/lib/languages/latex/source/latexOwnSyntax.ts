import { language, type LRLanguage } from '@codemirror/language';
import { Prec, StateEffect, StateField, type EditorState, type Extension } from '@codemirror/state';
import { ViewPlugin, type EditorView, type ViewUpdate } from '@codemirror/view';
import { docText } from '$lib/editor/source/docText';
import { projectIntelStore, type ProjectIntel } from '$lib/stores/projectIntel';
import { onUserDefinitions, userDefinitionsOf } from '../intellisense/completion/macros';
import type { UserDefinitions } from '../intellisense/completion/userMacroScan';
import { latexLanguage, latexPackageFile, latexPackageLanguage } from './latexLanguage';
import { ownMathOf, type OwnMath, type ProjectDefinitions } from '../syntax/ownMath';
import {
	NO_OWN_LITERALS,
	NO_OWN_SYNTAX,
	ownSyntaxKey,
	ownSyntaxTokensKey,
	type OwnLiterals,
	type OwnSyntax
} from '../syntax/tokens/ownSyntax';
import { structureTokens, structureTokensFor } from '../syntax/tokens/structureTokens';

const RESCAN_DELAY_MS = 400;
const NO_OWN_SYNTAX_KEY = ownSyntaxTokensKey(NO_OWN_SYNTAX);

export const setOwnSyntax = StateEffect.define<OwnSyntax>();

const ownSyntaxField = StateField.define<OwnSyntax>({
	create: () => NO_OWN_SYNTAX,
	update: (own, tr) => tr.effects.reduce((value, effect) => (effect.is(setOwnSyntax) ? effect.value : value), own)
});

export function ownSyntaxIn(state: EditorState): OwnSyntax {
	return state.field(ownSyntaxField, false) ?? NO_OWN_SYNTAX;
}

export function ownMathIn(state: EditorState): OwnMath {
	return ownSyntaxIn(state).math;
}

function mergedLiterals(buffer: OwnLiterals, project: OwnLiterals): OwnLiterals {
	const decided = new Set([...buffer.unread, ...buffer.read]);
	const commands = new Set(buffer.verbatimCommands.map((c) => c.name));
	return {
		unread: [...buffer.unread, ...project.unread.filter((n) => !decided.has(n))],
		read: [...buffer.read, ...project.read.filter((n) => !decided.has(n))],
		verbatimCommands: [...buffer.verbatimCommands, ...project.verbatimCommands.filter((c) => !commands.has(c.name))]
	};
}

/** the buffer's definitions over the other files' */
export function ownSyntaxOf(buffer: UserDefinitions, project?: ProjectDefinitions & { literals: OwnLiterals }): OwnSyntax {
	return { math: ownMathOf(buffer, project), literals: mergedLiterals(buffer.literals, project?.literals ?? NO_OWN_LITERALS) };
}

const languages = new Map<string, LRLanguage>();

function languageFor(own: OwnSyntax, packageFile: boolean): LRLanguage {
	const base = packageFile ? latexPackageLanguage : latexLanguage;
	const key = ownSyntaxTokensKey(own);
	if (key === NO_OWN_SYNTAX_KEY) return base;
	const cacheKey = `${packageFile}:${key}`;
	let found = languages.get(cacheKey);
	if (!found) {
		found = base.configure({ tokenizers: [{ from: structureTokens, to: structureTokensFor(own) }] });
		languages.set(cacheKey, found);
	}
	return found;
}

const ownSyntaxWatcher = ViewPlugin.fromClass(
	class {
		timer: ReturnType<typeof setTimeout> | undefined;
		scanned: { definitions: UserDefinitions; intel: ProjectIntel; own: OwnSyntax } | null = null;
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
				this.scanned = { definitions, intel, own: ownSyntaxOf(definitions, intel) };
			const own = this.scanned.own;
			if (ownSyntaxKey(own) !== ownSyntaxKey(ownSyntaxIn(state))) this.view.dispatch({ effects: setOwnSyntax.of(own) });
		}
		destroy() {
			clearTimeout(this.timer);
			this.stopListening();
		}
	}
);

/** the math and the verbatim text the document defines itself, read into its syntax tree */
export function latexOwnSyntax(): Extension {
	return [
		ownSyntaxField,
		Prec.highest(
			language.compute([ownSyntaxField, latexPackageFile], (state) =>
				languageFor(state.field(ownSyntaxField), state.facet(latexPackageFile))
			)
		),
		ownSyntaxWatcher
	];
}
