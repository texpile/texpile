// two listeners per window: the capture phase decides before any editor, and the late entries (an app key an editor
// also uses) get the key in the bubble phase if no editor took it. A key no entry owns goes on untouched
import type { KeyChord } from '../keys/keyChord';
import { chordOfEvent } from '../keys/keyEvent';
import { contextAt } from '../context/contextKeys';
import { resolveKeys, type KeybindingItem, type KeybindingTable } from '../resolver/keybindingResolver';

export type KeyDispatchDeps = {
	table(): KeybindingTable;
	canRun(command: string): boolean;
	run(item: KeybindingItem): void;
	/** the first keys of a chord waiting for the next, or null once it is done */
	onChord(pressed: KeyChord[] | null, missed?: boolean): void;
	mac: boolean;
};

const CHORD_WAIT_MS = 5000;

/** the key recorder in Preferences takes every key itself */
export const RECORDER_ATTR = 'data-key-recorder';

let pressedIn: EventTarget | null = null;

/** where the key being dispatched was pressed, for a command that acts on what has the focus */
export function keyTarget(): EventTarget | null {
	return pressedIn;
}

export type KeyDispatcher = { capture(e: KeyboardEvent): void; late(e: KeyboardEvent): void };

export function createKeyDispatcher(deps: KeyDispatchDeps): KeyDispatcher {
	let pending: KeyChord[] = [];
	let timer: ReturnType<typeof setTimeout> | undefined;

	function leaveChord(missed = false): void {
		clearTimeout(timer);
		pending = [];
		deps.onChord(null, missed);
	}

	function take(e: KeyboardEvent): void {
		e.preventDefault();
		e.stopImmediatePropagation();
	}

	function chordOf(e: KeyboardEvent): KeyChord | null {
		if (e.defaultPrevented || (e.target as Element | null)?.closest?.(`[${RECORDER_ATTR}]`)) return null;
		pressedIn = e.target;
		return chordOfEvent(e, deps.mac);
	}

	return {
		capture(e) {
			const chord = chordOf(e);
			if (!chord) return;
			const pressed = [...pending, chord];
			const result = resolveKeys(deps.table(), pressed, contextAt(e.target), deps.canRun);
			if (result.kind === 'more') {
				take(e);
				pending = pressed;
				clearTimeout(timer);
				timer = setTimeout(() => leaveChord(), CHORD_WAIT_MS);
				deps.onChord(pending);
			} else if (result.kind === 'found') {
				take(e);
				if (pending.length) leaveChord();
				deps.run(result.item);
			} else if (pending.length) {
				// a key that finishes no chord is swallowed, so it types nothing
				take(e);
				leaveChord(true);
			}
		},
		late(e) {
			const chord = chordOf(e);
			if (!chord) return;
			const result = resolveKeys(deps.table(), [chord], contextAt(e.target), deps.canRun, true);
			if (result.kind !== 'found') return;
			take(e);
			deps.run(result.item);
		}
	};
}
