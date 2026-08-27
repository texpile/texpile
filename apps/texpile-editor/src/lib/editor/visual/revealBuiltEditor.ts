import { upgradeVisibleNow } from './extensions/mathlivebridge/mathViewport';
import { typesetNow } from './extensions/mathlivebridge/mathStatic';

/** Defined in app.css, not Tailwind's `invisible`: this only ever reaches the DOM through a
 *  variable, and a utility kept alive by a bare string in a .ts file is one refactor from being
 *  purged - with nothing to catch it, since the editor would still build, just visibly. */
export const BUILDING_CLASS = 'editor-building';

/** one screenful of formulas is well inside this; the rest keeps its place in the idle drain */
const TYPESET_BUDGET_MS = 24;

/**
 * Show a built editor once what is on screen has stopped being a stand-in.
 *
 * Every heavy node - a raw chip, a formula - is built cheap and upgraded as it nears the viewport,
 * which is what lets a large document open at all. The cost is that the first painted frame is
 * always made of stand-ins: a chip is its own source as plain text, a formula is a blank box. So
 * the editor reads as source for a moment and then becomes the document.
 *
 * Hiding it during the build made that worse rather than better. `display: none` gives an element
 * no box, and an element with no box has no geometry to measure and intersects nothing either -
 * guaranteeing that the reveal exposed a document where nothing could have upgraded yet. Hiding by
 * VISIBILITY keeps the boxes, so the measurement below is against real layout.
 *
 * Synchronous, deliberately. What is on screen is something to measure, not something to wait for:
 * an earlier version waited on the upgrade observer's next delivery, which cannot say whether that
 * delivery was the screenful, and so needed a timeout to stop a bad guess from withholding the
 * editor. Measuring is both exact and cheaper - it upgrades one screen rather than the observer's
 * screen and a half either side, and leaves that margin to be pre-warmed after the reveal.
 */
export function revealBuiltEditor(el: HTMLElement | null | undefined): void {
	upgradeVisibleNow();
	typesetNow(TYPESET_BUDGET_MS);
	el?.classList?.remove(BUILDING_CLASS);
}
