// onReady after the first painted frame that shows the visible blocks with their fonts, formulas and hyphenation patterns,
// never sooner (G21): the crash guard, the boot timeline and the caret restore then run against a drawn editor.
// A font the page loads holds it too: the DOM drawn above the rows (the title fields) grows when one lands
import type { PlacedBlock } from '../contracts/engineTypes';
import type { LayoutBox } from '../contracts/layoutTypes';
import type { ViewDocument } from '../document/viewDocument';
import { islandHighlighterOf } from '../islands/islandHighlight';
import { FORMULA_FONTS } from '../layout/text/fontLoading';
import type { PaneShownMark } from './paneShownMark';
import type { CanvasSurface } from './surface';

export type ReadyHost = {
	/** the engine's font load, settling after its timeout whatever is still pending */
	loadFonts(fonts: readonly string[]): Promise<void>;
	fontLoaded(font: string): boolean;
	/** the hyphenation patterns or a font the page loads, while they arrive; null once they are in */
	inputsLoading(): Promise<unknown> | null;
	/** the rows and carets hidden while the gate waits, the input still focusable */
	hold(held: boolean): void;
	requestFrame(): void;
};

type Readiness = { fonts: Set<string>; formulas: number; formulaPending: boolean; pending: boolean };

function visit(box: LayoutBox, draft: Readiness): void {
	const replaced = box.element?.replaced;
	const unsized = !!replaced && !replaced.intrinsic(box.style);
	if (unsized || (box.element && islandHighlighterOf(box.element)?.pending)) draft.pending = true;
	if (replaced?.keys?.some((key) => key.kind === 'math')) {
		draft.formulas++;
		if (unsized) draft.formulaPending = true;
	}
	for (const child of box.children) visit(child, draft);
	for (const line of box.lines ?? [])
		for (const fragment of line.fragments) {
			if (fragment.kind === 'text' || fragment.kind === 'hyphen' || fragment.kind === 'struck') draft.fonts.add(fragment.run.fontString);
			if ((fragment.kind === 'atomic' || fragment.kind === 'widget') && fragment.box) visit(fragment.box, draft);
		}
}

/** the fonts the blocks' text is drawn in, their formulas, and whether a formula or any replaced content is unsized or a grammar loads */
export function readinessOf(blocks: readonly PlacedBlock[]): {
	fonts: string[];
	formulas: number;
	formulaPending: boolean;
	pending: boolean;
} {
	const found: Readiness = { fonts: new Set(), formulas: 0, formulaPending: false, pending: false };
	for (const block of blocks) visit(block.layout.box, found);
	return { ...found, fonts: [...found.fonts] };
}

export class ReadyGate {
	private done = false;
	private loading = false;
	/** fonts the engine's load settled, loaded or timed out: no document waits for them again */
	private readonly settledFonts = new Set<string>();
	private awaiting: Promise<unknown> | null = null;
	private placing = 0;
	private placeHeld = false;

	constructor(
		private readonly host: ReadyHost,
		private readonly onReady: (() => void) | undefined
	) {
		host.hold(true);
	}

	get ready(): boolean {
		return this.done;
	}

	/** another document swapped in: hidden until a frame draws it with its inputs in, then onReady again */
	rearm(): void {
		this.done = false;
		this.host.hold(true);
		this.host.requestFrame();
	}

	/** hidden while a place is taken, shown by the first frame painted after it, with no second onReady */
	holdWhilePlacing(placed: Promise<unknown>): void {
		this.placing++;
		this.placeHeld = true;
		this.host.hold(true);
		const release = () => {
			this.placing--;
			this.host.requestFrame();
		};
		void placed.then(release, release);
	}

	/** after every painted frame until it fires, which it says; a formula, a font or the patterns arriving paint again */
	painted(blocks: readonly PlacedBlock[]): boolean {
		if (this.placing) return false;
		if (this.done) {
			if (this.placeHeld) this.host.hold(false);
			this.placeHeld = false;
			return false;
		}
		const { fonts, formulas, formulaPending } = readinessOf(blocks);
		if (formulaPending || this.inputsPending()) return false;
		// a formula draws blank until the formula fonts arrive
		const wanted = formulas > 0 ? [...fonts, ...FORMULA_FONTS] : fonts;
		const missing = wanted.filter((font) => !this.settledFonts.has(font) && !this.host.fontLoaded(font));
		if (missing.length) {
			if (this.loading) return false;
			this.loading = true;
			void this.host.loadFonts(fonts).then(() => {
				this.loading = false;
				for (const font of missing) this.settledFonts.add(font);
				this.host.requestFrame();
			});
			return false;
		}
		this.done = true;
		this.placeHeld = false;
		this.host.hold(false);
		this.onReady?.();
		return true;
	}

	private inputsPending(): boolean {
		const loading = this.host.inputsLoading();
		if (!loading) return false;
		if (this.awaiting !== loading) {
			this.awaiting = loading;
			const settled = () => {
				if (this.awaiting === loading) this.awaiting = null;
				this.host.requestFrame();
			};
			void loading.then(settled, settled);
		}
		return true;
	}
}

/** the gate over a frame loop's view: it holds the rows and carets, and takes the pane's shown mark off while it holds */
export function viewReadyGate(
	view: {
		readonly surface: CanvasSurface;
		readonly model: ViewDocument;
		readonly onReady?: () => void;
		loadFonts(fonts: readonly string[]): Promise<void>;
	},
	mark: PaneShownMark,
	requestFrame: () => void
): ReadyGate {
	const fonts = view.surface.dom.ownerDocument.fonts as FontFaceSet | undefined;
	const host: ReadyHost = {
		loadFonts: (list) => view.loadFonts(list),
		fontLoaded: (font) => fonts?.check(font) ?? true,
		inputsLoading: () => view.model.patternsLoading() ?? (fonts?.status === 'loading' ? fonts.ready : null),
		hold(held) {
			view.surface.setHeld(held);
			if (held) mark.hide();
		},
		requestFrame
	};
	return new ReadyGate(host, view.onReady);
}
