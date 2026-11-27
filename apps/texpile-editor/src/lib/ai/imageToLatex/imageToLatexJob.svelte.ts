// One picture being turned into source: the part picked, the request and its one retry, the preview, and the insert
import { m } from '$lib/paraglide/messages';
import { agentName, agentOffered } from '$lib/ai/agent/aiAgent.svelte';
import { imageToLatexBridge, type ImageToLatexBridge } from './imageToLatexBridge';
import { imageAnswerSource, imageRequest, imageRetryRequest, imageSystem } from './imagePrompt';
import { pictureBitmap, pictureForService, wantsRegion, type PictureRegion } from './pictureBytes';
import { answerPreview, type AnswerPreview } from './answerPreview';
import type { ImageToLatexRequest, ImageToLatexTarget } from './imageToLatexRequest';

export type ImageToLatexPhase = 'loading' | 'picking' | 'reading' | 'fixing' | 'done' | 'failed';

export class ImageToLatexJob {
	phase = $state<ImageToLatexPhase>('loading');
	/** the picture as the dialog shows it */
	url = $state<string | null>(null);
	size = $state<{ w: number; h: number } | null>(null);
	region = $state<PictureRegion | null>(null);
	source = $state('');
	preview = $state<AnswerPreview | null>(null);
	error = $state<string | null>(null);
	private readonly chosen = agentOffered();
	readonly agent = this.chosen ? agentName(this.chosen) : '';

	private bitmap: ImageBitmap | null = null;
	private running: string | null = null;
	private ownUrl = false;
	private closed = false;

	constructor(
		readonly target: ImageToLatexTarget,
		private picture: ImageToLatexRequest['picture']
	) {
		void this.load();
	}

	private async load(): Promise<void> {
		try {
			this.bitmap = await pictureBitmap(this.picture.blob);
		} catch {
			this.phase = 'failed';
			this.error = m.ai_image_unreadable();
			return;
		}
		if (this.closed) return void this.bitmap.close();
		this.url = URL.createObjectURL(this.picture.blob);
		this.ownUrl = true;
		this.size = { w: this.bitmap.width, h: this.bitmap.height };
		if (wantsRegion(this.bitmap, this.picture.regionFirst)) this.phase = 'picking';
		else void this.convert();
	}

	get busy(): boolean {
		return this.phase === 'reading' || this.phase === 'fixing' || this.phase === 'loading';
	}

	async convert(): Promise<void> {
		const bridge = imageToLatexBridge();
		if (!bridge || !this.bitmap || this.closed) return;
		this.stop();
		const id = crypto.randomUUID();
		this.running = id;
		this.phase = 'reading';
		this.error = null;
		this.preview = null;
		try {
			await this.read(bridge, id);
		} catch (error) {
			if (this.running === id) this.fail({ error: error instanceof Error ? error.message : String(error) });
		}
	}

	private async read(bridge: ImageToLatexBridge, id: string): Promise<void> {
		const { dialect } = this.target;
		const image = await pictureForService(this.bitmap!, this.region);
		if (this.running !== id) return;
		function ask(request: string) {
			return bridge.imageToLatex({ id, system: imageSystem(dialect), request, ...image });
		}
		const first = await ask(imageRequest(dialect));
		if (this.running !== id) return;
		if (!first.ok) return this.fail(first);
		this.source = imageAnswerSource(first.text);
		let preview = await answerPreview(this.source, dialect, await this.target.place());
		if (this.running !== id) return;
		if (preview.kind === 'drawing-error' && preview.fixable) {
			this.phase = 'fixing';
			const second = await ask(imageRetryRequest(dialect, this.source, preview.error));
			if (this.running !== id) return;
			if (second.ok) {
				this.source = imageAnswerSource(second.text);
				preview = await answerPreview(this.source, dialect, await this.target.place());
				if (this.running !== id) return;
			}
		}
		this.preview = preview;
		this.phase = 'done';
		this.running = null;
	}

	private fail(answer: { error: string; cancelled?: true }): void {
		this.running = null;
		if (answer.cancelled) return;
		this.phase = 'failed';
		this.error = m.ai_image_failed({ agent: this.agent, error: answer.error });
	}

	private stop(): void {
		if (this.running) imageToLatexBridge()?.cancel(this.running);
		this.running = null;
	}

	insert(): void {
		if (this.source) this.target.insert(this.source);
		this.close();
	}

	close(): void {
		this.closed = true;
		this.stop();
		this.bitmap?.close();
		if (this.ownUrl && this.url) URL.revokeObjectURL(this.url);
	}
}
