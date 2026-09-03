// What a dialog offers, and the order a platform expects it in.
//
// A modal says which buttons it has; the row decides where each goes. macOS and Linux put the
// action you most likely want on the trailing edge with Cancel beside it; Windows leads with it
// and keeps Cancel last. VS Code's custom dialog rearranges the same way.
import type { Component } from 'svelte';

export type DialogButton = {
	label: string;
	onclick?: () => void;
	/** the affirmative action, drawn filled; cancel dismisses; anything else is a plain secondary */
	role?: 'primary' | 'cancel' | 'secondary';
	/** a primary that destroys something: tonal error instead of filled primary */
	danger?: boolean;
	disabled?: boolean;
	/** a spinner where the icon would be; the button is disabled while it spins */
	busy?: boolean;
	icon?: Component<{ class?: string }>;
	/** a link that opens in the browser, drawn as a button */
	href?: string;
	tip?: string;
	/** for the odd button that wants a tonal fill or a fixed width */
	class?: string;
};

export type ButtonOrder = 'mac' | 'windows';

/** macOS/Linux: the rest, then Cancel, then the primary; Windows: the primary, the rest, then Cancel */
export function orderButtons<T extends Pick<DialogButton, 'label' | 'role'>>(buttons: readonly T[], order: ButtonOrder): T[] {
	const primary = buttons.filter((b) => b.role === 'primary');
	const cancel = buttons.filter((b) => b.role === 'cancel');
	const rest = buttons.filter((b) => b.role !== 'primary' && b.role !== 'cancel');
	return order === 'windows' ? [...primary, ...rest, ...cancel] : [...rest, ...cancel, ...primary];
}
