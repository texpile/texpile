// one image tab's edits until they are saved over the file or let go
import { fileService } from '$lib/files/service/fileService';
import { nativeBridge } from '$lib/workspace/fileSystem';
import type { Crop } from '../crop/cropGeometry';
import { NO_EDITS, drawEdited, editedSize, flipped, isUnedited, turned, type ImageEdits } from './imageEdits';

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

function loadImage(url: string): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const image = new Image();
		// the file protocol answers cross-origin, and without this the canvas could not be saved
		image.crossOrigin = 'anonymous';
		image.onload = () => resolve(image);
		image.onerror = () => reject(new Error('The image could not be read.'));
		image.src = url;
	});
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
	return new Promise((resolve, reject) =>
		canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('The image could not be written.'))), type, quality)
	);
}

export class ImageEditSession {
	edits = $state.raw<ImageEdits>(NO_EDITS);
	cropping = $state(false);
	/** what the viewer shows while editing: the edited image, or the turned one under the crop box */
	preview = $state<string | null>(null);
	natural = $state({ w: 0, h: 0 });
	originalAt = $state<number | null>(null);
	saving = $state(false);
	private image: HTMLImageElement | null = null;

	constructor(private readonly path: () => string) {}

	get dirty(): boolean {
		return !isUnedited(this.edits);
	}

	get output(): { w: number; h: number } {
		return editedSize(this.edits, this.natural.w, this.natural.h);
	}

	async open(url: string): Promise<void> {
		this.image = await loadImage(url);
		this.natural = { w: this.image.naturalWidth, h: this.image.naturalHeight };
		this.edits = NO_EDITS;
		this.cropping = false;
		this.originalAt = (await nativeBridge()?.imageOriginalAt?.(this.path())) ?? null;
		this.redraw();
	}

	close(): void {
		this.setPreview(null);
		this.image = null;
		this.edits = NO_EDITS;
		this.cropping = false;
	}

	turn(dir: 'left' | 'right'): void {
		this.change(turned(this.edits, dir));
	}

	flip(axis: 'x' | 'y'): void {
		this.change(flipped(this.edits, axis));
	}

	setCrop(crop: Crop): void {
		this.edits = { ...this.edits, crop };
	}

	toggleCrop(): void {
		this.cropping = !this.cropping;
		this.redraw();
	}

	/** a width in pixels to shrink to; null, or one as wide as the crop, keeps the size */
	setWidth(width: number | null): void {
		this.change({ ...this.edits, width: width && width > 0 ? Math.round(width) : null });
	}

	reset(): void {
		this.cropping = false;
		this.change(NO_EDITS);
	}

	/** the edited image written over the file, its original kept first */
	async save(): Promise<void> {
		const encoding = encodingOf(this.path());
		if (!this.image || !encoding || !this.dirty) return;
		this.saving = true;
		try {
			const blob = await toBlob(drawEdited(this.image, this.edits, true), encoding.type, encoding.quality);
			await nativeBridge()?.imageKeepOriginal?.(this.path());
			await fileService.writeBinary(this.path(), blob);
		} finally {
			this.saving = false;
		}
	}

	async restoreOriginal(): Promise<void> {
		await nativeBridge()?.imageRestoreOriginal?.(this.path());
		this.originalAt = null;
	}

	private change(edits: ImageEdits): void {
		this.edits = edits;
		this.redraw();
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
