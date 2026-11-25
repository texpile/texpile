// the key routing chain (10.1): the popup, the nested editor, its views' stopEvent, handleKeyDown, the canvas keys
import { currentPlatform, intentFor, type KeyIntent, type Platform } from '$lib/editor/keys/platformKeys';
import type { CompletionKeys } from '../../contracts/inputTypes';
import type { NestedEditor } from '../../contracts/nodeViewTypes';
import type { ViewInputFacts, VisualView } from '../../contracts/viewTypes';
import { KillRing } from '../editing/killRing';
import { goalColumnOf } from '../motion/goalColumn';
import { captureKeys } from './captureKeys';
import { runKeyIntent } from './nativeKeys';

/** the nested editor holding the caret, and whether its view or one around it stops a key (stopEvent) */
export type KeyNesting = { active(): NestedEditor | null; stopsEvent(event: KeyboardEvent): boolean };

type InputFactsRecord = { -readonly [K in keyof ViewInputFacts]: ViewInputFacts[K] };

export class KeyRouter {
	constructor(
		private readonly view: VisualView,
		private readonly nested: KeyNesting,
		private readonly popup: () => CompletionKeys | null,
		private readonly platform: Platform = currentPlatform
	) {}

	private readonly ring = new KillRing();

	private get goal() {
		return goalColumnOf(this.view);
	}

	/** true when the canvas acted on the key; the caller calls preventDefault */
	keydown(event: KeyboardEvent): boolean {
		const { view } = this;
		const facts = view.input as InputFactsRecord;
		facts.shiftKey = event.keyCode === 16 || event.shiftKey;
		facts.lastKeyCode = event.keyCode;
		facts.lastKeyCodeTime = Date.now();
		if (view.composing || event.isComposing || event.keyCode === 229) return false;
		const owner = this.nested.active();
		// a formula takes its keys in a read-only view too: its caret moves and its selection copies (E14)
		if (!view.editable && owner?.kind !== 'math') return false;
		if (this.popup()?.keydown(event)) return true;
		if (owner?.keydown(event) === 'handled') {
			this.keepGoalPast(owner, event);
			return true;
		}
		// a key MathLive leaves to text input reaches the formula as typed text, never the document's keymaps
		if (owner?.kind === 'math') return false;
		if (this.nested.stopsEvent(event)) return false;
		if (view.someProp('handleKeyDown', (f) => f(view, event))) return true;
		if (captureKeys(view, event, this.platform)) return true;
		if (owner?.keydownAfter?.(event) === 'handled') return true;
		const intent = intentFor(event, this.platform);
		return (
			(intent !== null && runKeyIntent(view, intent, { goal: this.goal, ring: this.ring, platform: this.platform })) ||
			this.swallowed(event)
		);
	}

	/** an OS edit without a key (deleteWordBackward, insertTranspose): the intent the platform table gives its key */
	runIntent(intent: KeyIntent): boolean {
		return this.view.editable && runKeyIntent(this.view, intent, { goal: this.goal, ring: this.ring, platform: this.platform });
	}

	/** an Up or Down that left a formula keeps its goal x for the next one (A5) */
	private keepGoalPast(owner: NestedEditor, event: KeyboardEvent): void {
		const x = (event.key === 'ArrowUp' || event.key === 'ArrowDown') && this.nested.active() !== owner ? owner.verticalGoal?.() : null;
		if (x !== null && x !== undefined) this.goal.keep(x, this.view.state.selection.head);
	}

	/** prosemirror-view keeps the browser from its own formatting, undo and line breaks */
	private swallowed(event: KeyboardEvent): boolean {
		const mod = this.platform === 'mac' ? event.metaKey : event.ctrlKey;
		return event.key === 'Enter' || event.key === 'Escape' || (mod && /^[biyz]$/i.test(event.key));
	}
}
