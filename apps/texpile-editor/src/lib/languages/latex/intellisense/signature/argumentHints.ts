// the tooltip that shows a command's arguments while the cursor is inside them
import { currentCompletions } from '@codemirror/autocomplete';
import { Prec, StateEffect, StateField, type EditorState, type Extension, type Transaction } from '@codemirror/state';
import { ViewPlugin, hasHoverTooltips, keymap, showTooltip, type Tooltip } from '@codemirror/view';
import { settings } from '$lib/settings';
import { observe } from '$lib/runes/observe.svelte';
import { docText } from '$lib/editor/source/docText';
import { renameCardOpen } from '$lib/editor/source/rename/renameCardTooltip';
import {
	closersOf,
	commonCommand,
	enclosingCalls,
	enclosingEnvironment,
	rolesOf,
	type EnclosingCall
} from '../../knowledge/calls/commandCalls';
import { commonEnvFacts, commonEnvNames, envNameAlternation, hasLiteralBody } from '../../knowledge/environments/envFacts';
import type { LoadedFile } from '../../knowledge/loadedFiles';
import { stackedEnvironments } from '../../knowledge/stackedEntries';
import { FILE_ROLES, type Argument, type Role } from '../../knowledge/types';
import { blankUnread } from '../../texCode';
import { userEnvironmentSignature } from '../completion/macros';
import { documentPackages, preambleOf, preamblePackagesNow } from '../packages/loadedPackages';
import { documentReading } from './documentReadings';
import { renderArgumentHint } from './argumentHintDom';
import { hintOf, readingOfSignature, type ArgumentHint } from './argumentSlots';

const LOOK_BACK = 2000;
// a listing body is long, and hints stay out of it
const LITERAL_LOOK_BACK = 20_000;
// \input name: the command and a space before the name
const BARE_NAME = /\\([A-Za-z@]+)[ \t\n]+[^\s{}\\]*$/;

const LITERAL_ENVIRONMENT = new RegExp(`\\\\(begin|end)\\{(${envNameAlternation(commonEnvNames(hasLiteralBody))})\\}`, 'g');

// the text ends inside a verbatim or listing body
function endsInLiteralBody(text: string): boolean {
	const open: string[] = [];
	for (const m of text.matchAll(LITERAL_ENVIRONMENT)) {
		if (/(?<!\\)%/.test(text.slice(text.lastIndexOf('\n', m.index) + 1, m.index))) continue;
		if (m[1] === 'begin') open.push(m[2]);
		else if (open.includes(m[2])) open.length = open.lastIndexOf(m[2]);
	}
	return open.length > 0;
}

// whether the text before the cursor can be inside a call, so the packages are resolved only for one that might be
function mayBeInCall(before: string): boolean {
	if (closersOf(before)) return true;
	const name = BARE_NAME.exec(before)?.[1];
	const reading = name === undefined ? null : commonCommand(name);
	return !!reading && reading.args.some((a) => rolesOf(a).some((r) => (FILE_ROLES as Role[]).includes(r)));
}

function environmentArguments(loaded: LoadedFile[] | null, text: string, name: string): Argument[] | null {
	const known = loaded && stackedEnvironments(loaded).get(name)?.args;
	if (known) return known;
	const signature = userEnvironmentSignature(text, name);
	return signature === null ? ((commonEnvFacts(name).args as Argument[] | undefined) ?? null) : readingOfSignature(signature).args;
}

type HintReading = {
	hint: ArgumentHint | null;
	/** the preamble whose packages are still loading, which the hint waits for */ waitingOn: string | null;
};

function readHint(state: EditorState): HintReading {
	const { head, empty } = state.selection.main;
	if (!empty) return { hint: null, waitingOn: null };
	const raw = state.sliceDoc(Math.max(0, head - LOOK_BACK), head);
	if (!mayBeInCall(raw)) return { hint: null, waitingOn: null };
	const text = docText(state.doc);
	const loaded = preamblePackagesNow(text);
	const before = blankUnread(raw);
	const command = enclosingCalls(before, (name) => documentReading(loaded, text, name))[0];
	const environment = enclosingEnvironment(before, (name) => environmentArguments(loaded, text, name));
	// the one that opens last is the one the cursor is in
	const call: EnclosingCall | undefined =
		command && environment ? (command.at > environment.at ? command : environment) : (command ?? environment ?? undefined);
	if (!call) return { hint: null, waitingOn: null };
	if (endsInLiteralBody(state.sliceDoc(Math.max(0, head - LITERAL_LOOK_BACK), head))) return { hint: null, waitingOn: null };
	const hint = hintOf(call, head - before.length + call.at);
	if (hint && call.reading.args[0]?.kind === 's' && before[call.at + 1 + call.command.length] === '*') hint.command += '*';
	// the common index reads \section[][]{} where the class reads [short title]{title}
	return loaded ? { hint, waitingOn: null } : { hint: null, waitingOn: hint ? preambleOf(text) : null };
}

/** the arguments of the command around the cursor, null when it is in no command's arguments or the packages are still loading */
export function argumentHintAt(state: EditorState): ArgumentHint | null {
	return readHint(state).hint;
}

const settingChanged = StateEffect.define<null>();
const dismissHint = StateEffect.define<null>();
const askHint = StateEffect.define<null>();

// VS Code's parameter hints: they open as an argument is typed or asked for, never when the cursor merely lands in one
type HintState = {
	enabled: boolean;
	cardOpen: boolean;
	/** the call shown, null when closed */
	open: string | null;
	/** opened while the packages were loading: the first hint read after them opens */
	pending: boolean;
	hint: ArgumentHint | null;
	waitingOn: string | null;
	tooltip: Tooltip | null;
};

// typing a { or [ opens an argument, and so does a picked completion that brings its braces
function opensArgument(tr: Transaction): boolean {
	if (tr.isUserEvent('input.complete')) return true;
	if (!tr.isUserEvent('input.type')) return false;
	let opens = false;
	tr.changes.iterChanges((_fromA, _toA, _fromB, _toB, inserted) => {
		if (/[{[]/.test(inserted.toString())) opens = true;
	});
	return opens;
}

function callOf(hint: ArgumentHint): string {
	return `${hint.command}@${hint.at}`;
}

function keyOf(hint: ArgumentHint): string {
	return `${hint.command}@${hint.at}:${hint.active}:${hint.slots.map((s) => s.open + s.label).join()}`;
}

const hintField = StateField.define<HintState>({
	create: () => ({ enabled: false, cardOpen: false, open: null, pending: false, hint: null, waitingOn: null, tooltip: null }),
	update(value, tr) {
		const enabled = settings.current.argumentHints !== false;
		const cardOpen = renameCardOpen(tr.state);
		const loaded = tr.effects.some((e) => e.is(settingChanged));
		// the switch only stops hints opening as you type; the shortcut still asks for one
		const askedByKey = tr.effects.some((e) => e.is(askHint));
		const asked = askedByKey || (enabled && opensArgument(tr));
		// a click anywhere, or the switch turned off, closes it the way Escape does
		const dismissed = tr.effects.some((e) => e.is(dismissHint)) || tr.isUserEvent('select.pointer') || (!enabled && value.enabled);
		const kept = !dismissed && (value.open !== null || value.pending);
		const moved = tr.docChanged || tr.selection !== undefined || enabled !== value.enabled || cardOpen !== value.cardOpen || loaded;
		const reading: HintReading =
			cardOpen || !(asked || kept) ? { hint: null, waitingOn: null } : moved || asked ? readHint(tr.state) : value;
		const { hint, waitingOn } = reading;
		// a read that only waited for the packages keeps an open that was asked for meanwhile
		const pending = !dismissed && (asked || (value.pending && !tr.docChanged && !tr.selection)) && !hint;
		const opening = asked || (value.pending && loaded);
		// once open it follows the cursor into any call, and closes where there is none
		const open = hint && !dismissed && (opening || value.open !== null) ? callOf(hint) : null;
		const shown = open && hint && !hasHoverTooltips(tr.state);
		const state = { enabled, cardOpen, open, pending: pending && !!waitingOn, hint, waitingOn };
		if (!shown) return { ...state, tooltip: null };
		if (value.tooltip && value.hint && keyOf(value.hint) === keyOf(hint)) return { ...state, tooltip: value.tooltip };
		return { ...state, tooltip: { pos: hint.at, above: true, strictSide: true, create: () => ({ dom: renderArgumentHint(hint) }) } };
	},
	provide: (field) => showTooltip.from(field, (value) => value.tooltip)
});

// a hint waits for the document's packages, then reads again
const packageWatcher = ViewPlugin.define((view) => {
	let waitedOn: string | null = null;
	let live = true;
	function watch() {
		const { waitingOn } = view.state.field(hintField);
		if (waitingOn === waitedOn) return;
		waitedOn = waitingOn;
		if (waitingOn === null) return;
		void documentPackages(waitingOn)
			.then(() => live && view.dispatch({ effects: settingChanged.of(null) }))
			.catch(() => {});
	}
	watch();
	return {
		update: watch,
		destroy() {
			live = false;
		}
	};
});

// the Preferences switch flips with no transaction in the editor
const settingWatcher = ViewPlugin.define((view) => {
	let first = true;
	let live = true;
	const stop = observe(
		() => settings.current.argumentHints,
		() => {
			if (first) first = false;
			else queueMicrotask(() => live && view.dispatch({ effects: settingChanged.of(null) }));
		}
	);
	return {
		destroy() {
			live = false;
			stop();
		}
	};
});

const blurWatcher = ViewPlugin.define((view) => ({
	update(update) {
		if (update.focusChanged && !view.hasFocus && view.state.field(hintField).open !== null)
			queueMicrotask(() => view.dispatch({ effects: dismissHint.of(null) }));
	}
}));

// Mod-Shift-Space is VS Code's Trigger Parameter Hints
const hintKeymap = keymap.of([
	{
		key: 'Mod-Shift-Space',
		run(view) {
			view.dispatch({ effects: askHint.of(null) });
			return true;
		}
	}
]);

// ahead of the completion keymap, which takes Escape while a source is merely active; VS Code's list takes it only while shown
const hintEscape = Prec.highest(
	keymap.of([
		{
			key: 'Escape',
			run(view) {
				if (!view.state.field(hintField).tooltip || currentCompletions(view.state).length > 0) return false;
				view.dispatch({ effects: dismissHint.of(null) });
				return true;
			}
		}
	])
);

/** goes before autocompletion(), so its Escape runs first */
export function argumentHints(): Extension {
	return [hintEscape, hintField, settingWatcher, packageWatcher, blurWatcher, hintKeymap];
}
