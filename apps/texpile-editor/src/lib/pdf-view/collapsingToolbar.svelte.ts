// A toolbar's overflow behavior: collapse control groups (in a fixed order) while the row
// overflows, restore them as width returns, and run the "..." menu that holds the collapsed ones.
// A runes class so the toolbar just binds its elements and reads `hidden`/`menu.open`.
import { AnchoredMenu } from './anchoredMenu.svelte';

export class CollapsingToolbar {
	row = $state<HTMLDivElement>();
	readonly menu = new AnchoredMenu('end');
	private collapsed = $state(0);

	get hidden(): Set<string> {
		return new Set(this.order().slice(0, this.collapsed));
	}

	// row width when each step was taken; restoring only above it keeps the loop from oscillating
	private widthAt: number[] = [];
	private frame = 0;

	/** `order` is read live: a bar whose groups come and go still collapses the right ones */
	constructor(private readonly order: () => readonly string[]) {
		this.attachEffects();
	}

	get anyCollapsed(): boolean {
		return this.collapsed > 0;
	}

	private schedule = () => {
		if (this.frame) return;
		this.frame = requestAnimationFrame(() => {
			this.frame = 0;
			this.fit();
		});
	};

	private fit() {
		const el = this.row;
		if (!el) return;
		const over = el.scrollWidth > el.clientWidth + 1;
		if (over && this.collapsed < this.order().length) {
			this.widthAt[this.collapsed + 1] = el.clientWidth;
			this.collapsed++;
			this.schedule();
			return;
		}
		if (!over && this.collapsed > 0 && el.clientWidth > (this.widthAt[this.collapsed] ?? 0) + 8) {
			this.collapsed--;
			this.schedule();
		}
	}

	private attachEffects(): void {
		$effect(() => {
			const el = this.row;
			if (!el) return;
			const ro = new ResizeObserver(this.schedule);
			ro.observe(el);
			// a group can grow at the same row width: the live preview's status text arrives after the first fit
			const mo = new MutationObserver(this.schedule);
			mo.observe(el, { childList: true, subtree: true, characterData: true });
			this.schedule();
			return () => {
				ro.disconnect();
				mo.disconnect();
				if (this.frame) cancelAnimationFrame(this.frame);
				this.frame = 0;
			};
		});
	}
}
