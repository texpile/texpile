// one image's crop mode in the paper: a box and quarter turns over the whole image, until Done or Cancel
import { UNCROPPED, isUncropped, turnCrop, type Crop } from '$lib/images/crop/cropGeometry';
import { loadImage } from '$lib/images/edit/imageEdits';
import { cropOfTrim, quarterTurns, readGraphicsCrop, trimOfCrop, turnedCrop, writeGraphicsCrop } from './graphicsCrop';
import { imageBpSize } from './imageBpSize';

export class PaperCropSession {
	/** on the image as it is turned */
	crop = $state.raw<Crop>(UNCROPPED);
	turns = $state(0);
	pixels = $state({ w: 0, h: 0 });
	/** the frame's width on the page, the whole image at the scale the cut part showed at */
	frameWidth = $state(0);
	private bp = { w: 1, h: 1 };
	/** an angle= between quarter turns, kept as it is */
	private leftover = 0;

	get turnedPixels(): { w: number; h: number } {
		return this.turns % 2 ? { w: this.pixels.h, h: this.pixels.w } : this.pixels;
	}

	get frameHeight(): number {
		const { w, h } = this.turnedPixels;
		return w ? (this.frameWidth * h) / w : 0;
	}

	async open(url: string, options: string | null, shownWidth: number, maxWidth: number): Promise<void> {
		const image = await loadImage(url);
		this.pixels = { w: image.naturalWidth, h: image.naturalHeight };
		this.bp = await imageBpSize(url, this.pixels);
		const { trim, angle } = readGraphicsCrop(options);
		this.turns = quarterTurns(angle);
		this.leftover = angle - 90 * this.turns;
		this.crop = turnedCrop(cropOfTrim(trim, this.bp.w, this.bp.h), this.turns);
		const kept = 1 - this.crop.l - this.crop.r;
		this.frameWidth = Math.min(maxWidth, kept > 0 ? shownWidth / kept : shownWidth);
	}

	setCrop(crop: Crop): void {
		this.crop = crop;
	}

	turn(dir: 'left' | 'right'): void {
		const width = this.frameWidth;
		const height = this.frameHeight;
		this.turns = (this.turns + (dir === 'left' ? 1 : 3)) % 4;
		this.crop = turnCrop(this.crop, dir);
		// the same area on the page, turned
		this.frameWidth = Math.sqrt((width * height * this.turnedPixels.w) / this.turnedPixels.h) || width;
	}

	reset(): void {
		if (this.turns % 2) this.turn('left');
		this.turns = 0;
		this.leftover = 0;
		this.crop = UNCROPPED;
	}

	/** `options` with this crop and turn written in */
	optionsFrom(options: string): string {
		const crop = turnedCrop(this.crop, -this.turns);
		const trim = isUncropped(crop) ? null : trimOfCrop(crop, this.bp.w, this.bp.h);
		return writeGraphicsCrop(options, trim, this.leftover + 90 * this.turns);
	}
}
