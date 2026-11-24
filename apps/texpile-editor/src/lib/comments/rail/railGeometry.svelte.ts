// Keeps the margin's anchors current without the editors knowing about the margin: watch the
/** the source editor's text, which moves with every change to its DOM */
export function watchMutations(target: Node, moved: () => void): () => void {
	const mutations = new MutationObserver(moved);
	mutations.observe(target, { subtree: true, childList: true, attributes: true, characterData: true });
	return () => mutations.disconnect();
}

export class RailGeometry {
	anchors = $state.raw<Map<string, number>>(new Map());

	private frame = 0;
	private measure: (() => Map<string, number>) | null = null;

	/** in the editor's own frame, where its layout is current */
	measureNow = (): void => {
		if (this.frame) cancelAnimationFrame(this.frame);
		this.frame = 0;
		if (this.measure) this.anchors = this.measure();
	};

	schedule = (): void => {
		if (this.frame || !this.measure) return;
		this.frame = requestAnimationFrame(() => {
			this.frame = 0;
			if (this.measure) this.anchors = this.measure();
		});
	};

	/** `changes` calls back whenever the editor's text may have moved and returns the way to stop; with `framed`, from the
	 *  editor's frame, measured there so the cards move in the frame the text does */
	observe(opts: {
		changes: (moved: () => void) => () => void;
		framed?: boolean;
		resize: Element;
		scroll?: Element | null;
		measure: () => Map<string, number>;
	}): () => void {
		this.measure = opts.measure;
		const stopChanges = opts.changes(opts.framed ? this.measureNow : this.schedule);
		const sizes = new ResizeObserver(this.schedule);
		sizes.observe(opts.resize);
		opts.scroll?.addEventListener('scroll', this.schedule, { passive: true });
		window.addEventListener('resize', this.schedule);
		// at once in a framed editor: the column the cards take is in place before its first frame lays out the text
		if (opts.framed) this.measureNow();
		else this.schedule();
		return () => {
			stopChanges();
			sizes.disconnect();
			opts.scroll?.removeEventListener('scroll', this.schedule);
			window.removeEventListener('resize', this.schedule);
			if (this.frame) cancelAnimationFrame(this.frame);
			this.frame = 0;
			this.measure = null;
			this.anchors = new Map();
		};
	}
}
