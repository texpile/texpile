// one image's crop mode in the paper: a box and quarter turns over the whole image, until Done or Cancel
import { UNCROPPED, turnCrop, type Crop } from '$lib/images/crop/cropGeometry';
import { loadImage } from '$lib/images/edit/imageEdits';
import { turnedCrop } from './graphicsCrop';
import { imageBpSize } from './imageBpSize';
import type { ImageCrop, ImageSize } from './imageCropFormat';

export class PaperCropSession {
	/** on the image as it is turned */
	crop = $state.raw<Crop>(UNCROPPED);
	turns = $state(0);
	pixels = $state({ w: 0, h: 0 });
	/** the frame's width on the page, the whole image at the scale the cut part showed at */
	frameWidth = $state(0);
	size: ImageSize = { w: 1, h: 1 };

	get turnedPixels(): { w: number; h: number } {
		return this.turns % 2 ? { w: this.pixels.h, h: this.pixels.w } : this.pixels;
	}

	get frameHeight(): number {
		const { w, h } = this.turnedPixels;
		return w ? (this.frameWidth * h) / w : 0;
	}

	async open(url: string, read: (size: ImageSize) => ImageCrop, shownWidth: number, maxWidth: number): Promise<void> {
		const image = await loadImage(url);
		this.pixels = { w: image.naturalWidth, h: image.naturalHeight };
		this.size = await imageBpSize(url, this.pixels);
		const { crop, turns } = read(this.size);
		this.turns = turns;
		this.crop = turnedCrop(crop, turns);
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
		this.crop = UNCROPPED;
	}

	/** the crop on the image before its turn, as the source writes it */
	result(): ImageCrop {
		return { crop: turnedCrop(this.crop, -this.turns), turns: this.turns };
	}
}
