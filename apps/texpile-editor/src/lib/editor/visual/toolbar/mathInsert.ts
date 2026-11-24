// Inserting a symbol into the formula being edited, from the toolbar, the symbol panel and math search (T21)
import { toaster } from '$lib/modals/toaster-svelte';
import { m } from '$lib/paraglide/messages';
import { activeMath } from './activeMath.svelte';

/**
 * Insert LaTeX, or Typst in a Typst formula, at the math caret. Synchronous, so it can run from pointerdown before
 * anything moves focus or takes the button away.
 */
export function insertSymbol(source: string, format: 'latex' | 'typst' = 'latex'): void {
	const field = activeMath.current?.field;
	if (!field) {
		toaster.warning({ title: m.mathtoolbar_insert_no_field(), duration: 4000 });
		return;
	}

	// MathLive dispatches a cancelable `beforeinput` and bails if anything cancels it, while insert() reports true
	// either way: watching the event is the only way to tell a refusal from a success
	let vetoed = false;
	function watch(e: Event) {
		if (e.defaultPrevented) vetoed = true;
	}

	try {
		field.addEventListener('beforeinput', watch);
		const before = field.getValue('latex');
		// mode 'math': inheriting the model's mode routes the insert to another editor after something like \sin
		field.executeCommand(['insert', source, { focus: true, feedback: true, scrollIntoView: true, mode: 'math', format }]);
		if (vetoed || field.getValue('latex') === before) {
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
		field.removeEventListener('beforeinput', watch);
	}
}
