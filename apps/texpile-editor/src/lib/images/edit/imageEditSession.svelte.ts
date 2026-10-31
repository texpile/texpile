// one image tab's edits until they are saved over the file or let go
import { fileService } from '$lib/files/service/fileService';
import { nativeBridge } from '$lib/workspace/fileSystem';
import type { Crop } from '../crop/cropGeometry';
import { NO_EDITS, drawEdited, editedSize, flipped, loadImage, turned, type ImageEdits } from './imageEdits';
import { namedResolution, withResolution } from './imageResolution';
import { m } from '$lib/paraglide/messages';

const ENCODINGS: Record<string, { type: string; quality?: number }> = {
	png: { type: 'image/png' },
	jpg: { type: 'image/jpeg', quality: 0.92 },
	jpeg: { type: 'image/jpeg', quality: 0.92 },
	webp: { type: 'image/webp', quality: 0.92 }
};

function encodingOf(path: string): { type: string; quality?: number } | null {
	return ENCODINGS[path.split('.').pop()?.toLowerCase() ?? ''] ?? null;
}

/** the image tab edits PNG, JPEG and WebP; other images are shown only */
export function isEditableImage(path: string): boolean {
	return encodingOf(path) !== null;
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
	return new Promise((resolve, reject) =>
		canvas.toBlob((b) => (b ? resolve(b) : reject(new Error(m.image_write_failed()))), type, quality)
	);
}

export class ImageEditSession {
	edits = $state.raw<ImageEdits>(NO_EDITS);
	cropping = $state(false);
	/** the box while it is dragged, on the image turned and flipped */
	draftCrop = $state.raw<Crop>(NO_EDITS.crop);
	/** what the viewer shows while editing: the edited image, or the turned one under the crop box */
	preview = $state<string | null>(null);
	natural = $state({ w: 0, h: 0 });
	originalAt = $state<number | null>(null);
	private past = $state.raw<ImageEdits[]>([]);
	private future = $state.raw<ImageEdits[]>([]);
	/** the file as it was when editing began; every write is drawn from it, so a JPEG is encoded once per write */
	private image: HTMLImageElement | null = null;
	private writing: Promise<void> = Promise.resolve();
	private keptOriginal = false;
	private resolution: { x: number; y: number } | null = null;

	constructor(private readonly path: () => string) {}

	get output(): { w: number; h: number } {
		return editedSize(this.edits, this.natural.w, this.natural.h);
	}

	get canUndo(): boolean {
		return this.past.length > 0;
	}

	get canRedo(): boolean {
		return this.future.length > 0;
	}

	async open(url: string): Promise<void> {
		this.image = await loadImage(url);
		this.resolution = namedResolution(new Uint8Array(await (await fetch(url)).arrayBuffer()));
		this.natural = { w: this.image.naturalWidth, h: this.image.naturalHeight };
		this.edits = NO_EDITS;
		this.past = [];
		this.future = [];
		this.cropping = false;
		this.keptOriginal = false;
		this.originalAt = (await nativeBridge()?.imageOriginalAt?.(this.path())) ?? null;
		this.redraw();
	}

	/** resolves once the last write is on disk */
	async close(): Promise<void> {
		await this.writing;
		this.setPreview(null);
		this.image = null;
		this.cropping = false;
	}

	turn(dir: 'left' | 'right'): void {
		this.commit(turned(this.edits, dir));
	}

	flip(axis: 'x' | 'y'): void {
		this.commit(flipped(this.edits, axis));
	}

	startCrop(): void {
		this.draftCrop = this.edits.crop;
		this.cropping = true;
		this.redraw();
	}

	setCrop(crop: Crop): void {
		this.draftCrop = crop;
	}

	finishCrop(): void {
		this.cropping = false;
		if (this.draftCrop === this.edits.crop) this.redraw();
		else this.commit({ ...this.edits, crop: this.draftCrop });
	}

	cancelCrop(): void {
		this.cropping = false;
		this.redraw();
	}

	/** a width in pixels to shrink to; null, or one as wide as the crop, keeps the size */
	setWidth(width: number | null): void {
		this.commit({ ...this.edits, width: width && width > 0 ? Math.round(width) : null });
	}

	/** a height to shrink to, as the width that keeps the crop's proportions */
	setHeight(height: number | null): void {
		const full = editedSize({ ...this.edits, width: null }, this.natural.w, this.natural.h);
		this.setWidth(height && height > 0 ? (height * full.w) / full.h : null);
	}

	undo(): void {
		const last = this.past.at(-1);
		if (!last) return;
		this.past = this.past.slice(0, -1);
		this.future = [...this.future, this.edits];
		this.apply(last);
	}

	redo(): void {
		const next = this.future.at(-1);
		if (!next) return;
		this.future = this.future.slice(0, -1);
		this.past = [...this.past, this.edits];
		this.apply(next);
	}

	async restoreOriginal(): Promise<void> {
		await this.writing;
		await nativeBridge()?.imageRestoreOriginal?.(this.path());
		this.originalAt = null;
	}

	private commit(edits: ImageEdits): void {
		this.past = [...this.past, this.edits];
		this.future = [];
		this.apply(edits);
	}

	private apply(edits: ImageEdits): void {
		this.edits = edits;
		this.redraw();
		this.writing = this.writing
			.then(() => this.write())
			.catch((e: unknown) => {
				const reason = e instanceof Error ? e.message : String(e);
				dispatchEvent(new CustomEvent('toast', { detail: { message: m.image_save_failed({ reason }), timeout: 6000 } }));
			});
	}

	/** the edits as they are now written over the file, its original kept before the first write */
	private async write(): Promise<void> {
		const encoding = encodingOf(this.path());
		if (!this.image || !encoding) return;
		const drawn = await toBlob(drawEdited(this.image, this.edits, true), encoding.type, encoding.quality);
		const blob = this.resolution
			? new Blob([withResolution(new Uint8Array(await drawn.arrayBuffer()), this.resolution).slice()], { type: encoding.type })
			: drawn;
		if (!this.keptOriginal) {
			await nativeBridge()?.imageKeepOriginal?.(this.path());
			this.keptOriginal = true;
			this.originalAt = (await nativeBridge()?.imageOriginalAt?.(this.path())) ?? null;
		}
		await fileService.writeBinary(this.path(), blob);
		await nativeBridge()?.imageNoteWritten?.(this.path());
	}

	private redraw(): void {
		if (!this.image) return;
		const canvas = drawEdited(this.image, this.edits, !this.cropping);
		void toBlob(canvas, 'image/png').then((blob) => this.setPreview(URL.createObjectURL(blob)));
	}

	private setPreview(url: string | null): void {
		if (this.preview) URL.revokeObjectURL(this.preview);
		this.preview = url;
	}
}
