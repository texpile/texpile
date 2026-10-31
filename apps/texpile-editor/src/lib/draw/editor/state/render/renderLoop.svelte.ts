import { m } from '$lib/paraglide/messages';
import type { FigureEngine } from '../../provider/figureEngine';
import type { Drawing } from '../../drawing/drawing.types';
import type { LoadedFont } from '../../drawing/fontOutlines';
import type { FigureLanguage, FigureStatement, RenderedFigure } from '../../figure/figureLanguage';
import { IDENTITY, type SourceTransform } from '../../figure/geometry';

// a picture drawn longer than this while a newer source waits is given up, so a stuck one costs seconds, not a minute
const ABANDON_AFTER_MS = 5000;

/** keeps the drawing current with the source: one request in flight, and only the latest source waits behind it */
export class RenderLoop {
	drawing = $state.raw<Drawing | null>(null);
	fonts = $state.raw(new Map<number, LoadedFont>());
	transforms = $state.raw(new Map<number, SourceTransform>());
	outerTransforms = $state.raw(new Map<number, SourceTransform>());
	errors = $state.raw<string[]>([]);
	errorLines = $state.raw<(number | null)[]>([]);
	/** statements left out of the drawing on screen, as they cost the engine the whole picture */
	failed = $state.raw<number[]>([]);
	slots = $state.raw<RenderedFigure['slots']>([]);
	pins = $state.raw<RenderedFigure['pins']>([]);
	/** why nothing could be drawn at all */
	failure = $state<string | null>(null);
	ms = $state(0);
	busy = $state(false);
	/** the source the drawing on screen was typeset from */
	drawnSource = $state('');
	/** which picture of the file the drawing is, and its statements as they were then */
	drawnIndex = $state(-1);
	drawnStatements = $state.raw<FigureStatement[]>([]);
	/** the number of the request the drawing on screen answers; requests are numbered from 1 as they are made */
	drawnRequest = $state(0);
	/** the number the latest request got */
	requested = 0;
	outline = $state.raw<RenderedFigure['outline']>(() => null);

	#engine: FigureEngine;
	#language: FigureLanguage;
	#latest: { source: string; n: number } | null = null;
	#onDrawn: (source: string) => void;
	#onFailed: (source: string, failure: string) => void;
	#pictureIndex: () => number;
	#startedAt = 0;
	#abandonTimer: ReturnType<typeof setTimeout> | null = null;

	constructor(
		engine: FigureEngine,
		language: FigureLanguage,
		pictureIndex: () => number,
		onDrawn: (source: string) => void,
		onFailed: (source: string, failure: string) => void
	) {
		this.#engine = engine;
		this.#language = language;
		this.#pictureIndex = pictureIndex;
		this.#onDrawn = onDrawn;
		this.#onFailed = onFailed;
	}

	/** where the page loads an image the picture placed, when the engine serves them */
	get imageUrl() {
		return this.#engine.imageUrl;
	}

	/** a statement's transform, or the picture's own (0) */
	transformOf(i: number): SourceTransform {
		return this.transforms.get(i) ?? this.transforms.get(0) ?? IDENTITY;
	}

	/** a statement's transform before its own options */
	outerOf(i: number): SourceTransform {
		return this.outerTransforms.get(i) ?? this.transforms.get(0) ?? IDENTITY;
	}

	request(source: string) {
		this.#latest = { source, n: ++this.requested };
		if (!this.busy) void this.#drawLatest();
		else this.#abandonLater();
	}

	/** the source drawn again by TeX started afresh, whatever it kept */
	restart(source: string) {
		this.#latest = { source, n: ++this.requested };
		this.#engine.reset?.();
		if (!this.busy) void this.#drawLatest();
	}

	#abandonLater() {
		if (this.#abandonTimer) return;
		const wait = Math.max(0, this.#startedAt + ABANDON_AFTER_MS - performance.now());
		this.#abandonTimer = setTimeout(() => {
			this.#abandonTimer = null;
			if (this.#latest) this.#engine.abandon?.();
		}, wait);
	}

	async #drawLatest() {
		this.busy = true;
		while (this.#latest !== null) {
			const { source, n } = this.#latest;
			this.#latest = null;
			if (this.#abandonTimer) clearTimeout(this.#abandonTimer);
			this.#abandonTimer = null;
			this.#startedAt = performance.now();
			const index = this.#pictureIndex();
			const picture = this.#language.readPicture(source, index);
			if (!picture) {
				this.failure = m.figure_render_no_picture({ language: this.#language.name });
				this.#onFailed(source, this.failure);
				continue;
			}
			try {
				const r = await this.#language.render(this.#engine, source, picture);
				this.fonts = r.fonts;
				this.outline = r.outline;
				this.drawing = r.drawing;
				this.transforms = r.transforms;
				this.outerTransforms = r.outerTransforms;
				this.errors = r.errors;
				this.errorLines = r.errorLines;
				this.failed = r.failed;
				this.slots = r.slots;
				this.pins = r.pins;
				this.ms = r.ms;
				this.failure = null;
				this.drawnSource = source;
				this.drawnRequest = n;
				this.drawnIndex = index;
				this.drawnStatements = picture.statements;
				this.#onDrawn(source);
			} catch (e) {
				// given up for the newer source
				if (this.#latest) continue;
				this.failure = e instanceof Error ? e.message : String(e);
				this.#onFailed(source, this.failure);
			}
		}
		this.busy = false;
	}
}
