import { askedWidth, menuBudget, SIDE_GAP } from './commandCenterWidth';

// What gives way in the title bar so the command center keeps the window's center: first the Show PDF label, then the
// session's label, then the menus, one at a time. TitleBar measures and drives; the menu bar and the buttons read the result.
//
// A module singleton for the same reason the palette registry is one: one window, one title bar, and
// the alternative is threading a prop through a snippet that WorkspaceChrome owns.

class TitleBarLayout {
	/** how many top-level menus the menu bar has; it reports this on mount */
	totalMenus = $state(0);
	/** a session is on and its presence has a label to give up before the menus do */
	sessionLabelled = $state(false);
	/** Show PDF draws its icon alone */
	pdfIconOnly = $state(false);
	/** the menus, then the session's label, that render inline; the rest give way */
	private shown = $state(0);

	/**
	 * Width of the whole left block last observed at each shown count.
	 *
	 * This is what makes growing back safe. Shrinking is easy - the block is too wide, drop one - but
	 * growing needs to know how wide the block WOULD be with one more menu, which cannot be measured
	 * while that menu is not rendered. Remembering the width we saw on the way down answers it exactly,
	 * instead of estimating from label lengths (hopeless across locales - a CJK label is not the same
	 * width per character as a Latin one).
	 *
	 * Plain array, not $state: it is a measurement cache read inside fit(), and making it reactive
	 * would retrigger the very effect that writes it.
	 */
	private widthAt: number[] = [];

	/** how many menus render inline. The remainder go behind the overflow button; 0 means all of them do. */
	get visibleMenus(): number {
		return Math.min(this.shown, this.totalMenus);
	}

	/** the session's presence shows its label beside the faces */
	get sessionLabel(): boolean {
		return this.shown > this.totalMenus;
	}

	private get units(): number {
		return this.totalMenus + (this.sessionLabelled ? 1 : 0);
	}

	/** the menu bar declaring its size; start with everything showing and let fit() reduce */
	setTotal(n: number): void {
		if (this.totalMenus === n) return;
		this.totalMenus = n;
		this.restart();
	}

	setSessionLabelled(on: boolean): void {
		if (this.sessionLabelled === on) return;
		this.sessionLabelled = on;
		this.restart();
	}

	private restart(): void {
		this.shown = this.units;
		this.widthAt = [];
	}

	/**
	 * One step of the fit loop, driven by TitleBar's measurements.
	 *
	 * Deliberately one step per call rather than a loop: each change re-renders the row, which gives a
	 * fresh `leftW` on the next flush, which calls this again. It converges in at most totalMenus
	 * steps, and every step is based on a real measurement rather than a predicted one.
	 */
	fit(winW: number, leftW: number, rightW: number, labelsW: number): void {
		if (winW <= 0 || leftW <= 0) return;
		const iconOnly = winW / 2 - (this.pdfIconOnly ? rightW + labelsW : rightW) < askedWidth(winW) / 2 + SIDE_GAP;
		if (iconOnly !== this.pdfIconOnly) {
			this.pdfIconOnly = iconOnly;
			return;
		}
		const budget = menuBudget(winW, rightW);
		if (budget <= 0 || this.units === 0) return;
		this.widthAt[this.shown] = leftW;

		if (leftW > budget) {
			if (this.shown > 0) this.shown--;
			return;
		}
		// room to spare: put one back, but only if we have actually seen it fit at that width. Without
		// the recorded width this would grow blindly, overflow, shrink, and oscillate for ever.
		if (this.shown < this.units) {
			const wider = this.widthAt[this.shown + 1];
			if (wider !== undefined && wider <= budget) this.shown++;
		}
	}
}

export const titleBarLayout = new TitleBarLayout();

const TITLE_BAR_LABEL = 'data-title-bar-label';
const LABEL_GAP = 4; // gap-1 between a button's icon and its label

/** what the labels add to the right side, measured while hidden too */
export function measureTitleBarLabels(bar: HTMLElement | null): number {
	let width = 0;
	for (const label of bar?.querySelectorAll<HTMLElement>(`[${TITLE_BAR_LABEL}]`) ?? []) width += label.offsetWidth + LABEL_GAP;
	return width;
}
