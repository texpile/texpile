// Inserting a symbol into whichever mathfield the user is editing.
//
// Shared by the toolbar and the symbol panel, which is why it is here rather than in a component:
// both need it, and the one thing this must never do is keep its own idea of "the current
// mathfield". Every version of this that cached an element went stale and inserted into nothing.
import { activeWindow } from '$lib/childWindows/childWindowRegistry.svelte';
import { toaster } from '$lib/modals/toaster-svelte';
import { m } from '$lib/paraglide/messages';

/** the deepest focused element, crossing shadow roots (MathLive's deepActiveElement) */
function deepActiveElement(): Element | null {
	// in the window with focus, which may be an editor's own
	let el = activeWindow().document.activeElement;
	while (el?.shadowRoot?.activeElement) el = el.shadowRoot.activeElement;
	return el;
}

/**
 * The mathfield to act on RIGHT NOW, resolved the way MathLive's own virtual keyboard resolves it
 * (virtual-keyboard.ts, focusedMathfield): walk up from the deepest focused node until a
 * MathfieldElement host turns up. Resolved per call, never cached.
 */
export function liveMathfield(): HTMLElement | null {
	let target: Node | null = deepActiveElement();
	while (target) {
		if ('host' in target && (target as ShadowRoot).host instanceof window.MathfieldElement) {
			return (target as ShadowRoot).host as HTMLElement;
		}
		if (target instanceof window.MathfieldElement) return target;
		target = target.parentNode ?? (target as ShadowRoot).host ?? null;
	}
	return null;
}

/**
 * Insert LaTeX, or Typst in a Typst field, at the caret. Synchronous, so it can run from pointerdown
 * before anything moves focus or takes the button away.
 */
export function insertSymbol(source: string, format: 'latex' | 'typst' = 'latex'): void {
	const mf = liveMathfield();
	if (!(mf && mf instanceof window.MathfieldElement)) {
		toaster.warning({ title: m.mathtoolbar_insert_no_field(), duration: 4000 });
		return;
	}

	// MathLive dispatches a cancelable `beforeinput` and bails if anything cancels it. That event
	// bubbles and is composed, so it leaves the mathfield and travels up through ProseMirror's DOM
	// where any listener can veto it - and insert() reports true either way, so watching the event
	// is the only way to tell a refusal from a success.
	let vetoed = false;
	function watch(e: Event) {
		if (e.defaultPrevented) vetoed = true;
	}

	try {
		mf.addEventListener('beforeinput', watch);
		const before = mf.getValue('latex');

		// EXACTLY the options a virtual-keyboard keycap sends (virtual-keyboard/utils.ts,
		// executeKeycapCommand). focus:true has insert() focus the field itself, so we do none of it;
		// mode:'math' matters because ModeEditor.insert does `options.mode ?? model.mode`, and
		// inheriting the model's mode routes the insert to a different ModeEditor after something like
		// \sin leaves it in LaTeX-command mode.
		mf.executeCommand(['insert', source, { focus: true, feedback: true, scrollIntoView: true, mode: 'math', format }]);

		if (vetoed || mf.getValue('latex') === before) {
			console.warn('[math-toolbar] insert refused', {
				source,
				vetoed,
				reason: vetoed ? 'a beforeinput listener called preventDefault' : 'mathlive declined it'
			});
			toaster.warning({ title: m.mathtoolbar_insert_failed({ latex: source }), duration: 4000 });
		}
	} catch (err) {
		// nothing in here may fail quietly
		console.error('[math-toolbar] insert threw', { source, err });
		toaster.warning({ title: m.mathtoolbar_insert_failed({ latex: source }), duration: 4000 });
	} finally {
		mf.removeEventListener('beforeinput', watch);
	}
}
