import {
	autocompletion,
	completionStatus,
	startCompletion,
	type Completion,
	type CompletionContext,
	type CompletionResult
} from '@codemirror/autocomplete';
import { Compartment, EditorState, Facet, Prec, type Extension } from '@codemirror/state';
import { EditorView, keymap, ViewPlugin, type EditorView as CMView } from '@codemirror/view';
import { settings } from '$lib/settings';
import { toaster } from '$lib/modals/toaster-svelte';
import { m } from '$lib/paraglide/messages';
import { usesSelection } from './expand/bodyTemplate';
import { cutsThroughSyntax, wrapBodyFor } from './expand/wrapBody';
import { choiceCompletionSource, choiceFieldAt, choiceFields } from './expand/choiceFields';
import { expandSnippet } from './expand/expandSnippet';
import { autoMatches, popupCandidates, type CompiledSnippet } from './expand/matchSnippets';
import { contextAllows, snippetZoneAt } from './expand/snippetZone';
import { onSnippetRegistry, snippetRegistry } from './file/snippetRegistry';
import { mathKeys } from './math/mathKeys';
import type { SnippetLanguage } from './file/snippetTypes';

const snippetLanguage = Facet.define<SnippetLanguage, SnippetLanguage | null>({ combine: (v) => v[0] ?? null });

function languageOf(state: EditorState): SnippetLanguage | null {
	return state.facet(snippetLanguage);
}

function previewOf(body: string): string {
	return body.split('\n')[0].replace(/\$\{\d+(?::([^}]*))?\}|\$\d+/g, (_, d: string | undefined) => d ?? '…');
}

/** the popup's snippet entries, and the options of a choice stop the cursor is on */
export function snippetCompletionSource(ctx: CompletionContext): CompletionResult | null {
	const lang = languageOf(ctx.state);
	if (!lang) return null;
	const choice = choiceCompletionSource(ctx);
	if (choice) return choice;
	const line = ctx.state.doc.lineAt(ctx.pos);
	const candidates = popupCandidates(snippetRegistry().languages[lang].popup, line.text.slice(0, ctx.pos - line.from), line.from);
	if (!candidates) return null;
	const zone = snippetZoneAt(ctx.state, candidates.from, lang);
	const options: Completion[] = candidates.items
		.filter(({ compiled }) => contextAllows(compiled.snippet.context, zone))
		.map(({ compiled, prefix }) => ({
			label: prefix,
			detail: compiled.snippet.description || previewOf(wrapBodyFor(compiled, zone)),
			type: 'text',
			boost: Math.max(-99, Math.min(99, compiled.snippet.priority)),
			apply: (view: CMView, _c: Completion, from: number, to: number) =>
				expandSnippet(view, wrapBodyFor(compiled, zone), from, to, { selection: '', captures: [] })
		}));
	return options.length ? { from: candidates.from, options } : null;
}

function autoExpansion(stopUndoCapture: () => void): Extension {
	return EditorView.inputHandler.of((view, from, to, text) => {
		const lang = languageOf(view.state);
		if (!lang || settings.current.autoSnippets === false || view.composing || view.state.selection.ranges.length > 1) return false;
		const list = snippetRegistry().languages[lang].auto;
		const line = view.state.doc.lineAt(from);
		if (!list.length || to > line.to || text.includes('\n')) return false;
		const before = line.text.slice(0, from - line.from) + text;
		for (const match of autoMatches(list, before, line.from)) {
			const zone = snippetZoneAt(view.state, Math.min(match.from, from), lang);
			if (!contextAllows(match.compiled.snippet.context, zone)) continue;
			// the character goes in on its own first, so one undo gives back what was typed
			view.dispatch({ changes: { from, to, insert: text }, selection: { anchor: from + text.length }, userEvent: 'input.type' });
			stopUndoCapture();
			expandSnippet(view, wrapBodyFor(match.compiled, zone), match.from, from + text.length, { selection: '', captures: match.captures });
			return true;
		}
		return false;
	});
}

/** the "Wrap with" entries for where the selection is */
export function wrapSnippetsFor(state: EditorState): CompiledSnippet[] {
	const lang = languageOf(state);
	if (!lang) return [];
	const zone = snippetZoneAt(state, state.selection.main.from, lang);
	return snippetRegistry().languages[lang].wraps.filter((c) => contextAllows(c.snippet.context, zone));
}

/** the selection, wrapped; refused with a note when that would split a construct in two */
export function wrapSelection(view: CMView, compiled: CompiledSnippet): void {
	const { from, to } = view.state.selection.main;
	if (cutsThroughSyntax(view.state, from, to, compiled.lang)) {
		toaster.info({ title: m.wrap_refused_title(), description: m.wrap_refused_desc() });
		return;
	}
	const body = wrapBodyFor(compiled, snippetZoneAt(view.state, from, compiled.lang));
	expandSnippet(view, body, from, to, { selection: view.state.sliceDoc(from, to), captures: [] });
	view.focus();
}

function runKeyed(view: CMView, compiled: CompiledSnippet): boolean {
	const sel = view.state.selection.main;
	if (!contextAllows(compiled.snippet.context, snippetZoneAt(view.state, sel.from, compiled.lang))) return false;
	if (compiled.snippet.wrap || usesSelection(compiled.body)) wrapSelection(view, compiled);
	else expandSnippet(view, compiled.body, sel.from, sel.to, { selection: view.state.sliceDoc(sel.from, sel.to), captures: [] });
	return true;
}

const keyedConf = new Compartment();

function keyedBindings(lang: SnippetLanguage): Extension {
	return keymap.of(
		snippetRegistry().languages[lang].keyed.map((compiled) => ({
			key: compiled.snippet.key!,
			run: (view: CMView) => runKeyed(view, compiled)
		}))
	);
}

// app shortcuts win: these sit below every other keymap
function keyedSnippets(lang: SnippetLanguage): Extension {
	return [
		Prec.low(keyedConf.of(keyedBindings(lang))),
		ViewPlugin.define((view) => {
			const off = onSnippetRegistry(() => queueMicrotask(() => view.dispatch({ effects: keyedConf.reconfigure(keyedBindings(lang)) })));
			return { destroy: off };
		})
	];
}

// landing on a choice stop by Tab opens its list
const openChoices = EditorView.updateListener.of((update) => {
	if (!update.selectionSet || update.docChanged || completionStatus(update.state) !== null) return;
	const sel = update.state.selection.main;
	if (choiceFieldAt(update.state, sel.from, sel.to)) startCompletion(update.view);
});

export type SourceSnippetOptions = {
	/** ends the undo step, so an expansion and the trigger it replaced undo separately */
	stopUndoCapture?: () => void;
};

/** snippets in a source editor; LaTeX and Markdown take snippetCompletionSource into their own completion */
export function sourceSnippets(lang: SnippetLanguage, options: SourceSnippetOptions = {}): Extension {
	return [
		snippetLanguage.of(lang),
		choiceFields,
		autoExpansion(options.stopUndoCapture ?? (() => {})),
		mathKeys(lang, options.stopUndoCapture ?? (() => {})),
		keyedSnippets(lang),
		openChoices,
		// Typst's completion is otherwise tinymist's alone, and absent while it is missing
		lang === 'typst' ? [autocompletion(), EditorState.languageData.of(() => [{ autocomplete: snippetCompletionSource }])] : []
	];
}
