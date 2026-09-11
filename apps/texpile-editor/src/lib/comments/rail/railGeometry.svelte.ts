// Keeps the margin's anchors current without the editors knowing about the margin: watch the
export class RailGeometry {
	anchors = $state.raw<Map<string, number>>(new Map());

	private frame = 0;
	private measure: (() => Map<string, number>) | null = null;

	schedule = (): void => {
		if (this.frame || !this.measure) return;
		this.frame = requestAnimationFrame(() => {
			this.frame = 0;
			if (this.measure) this.anchors = this.measure();
		});
	};

	observe(opts: { mutate: Node; resize: Element; scroll?: Element | null; measure: () => Map<string, number> }): () => void {
		this.measure = opts.measure;
		const mutations = new MutationObserver(this.schedule);
		mutations.observe(opts.mutate, { subtree: true, childList: true, attributes: true, characterData: true });
		const sizes = new ResizeObserver(this.schedule);
		sizes.observe(opts.resize);
		opts.scroll?.addEventListener('scroll', this.schedule, { passive: true });
		window.addEventListener('resize', this.schedule);
		this.schedule();
		return () => {
			mutations.disconnect();
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
