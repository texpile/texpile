import { describe, expect, it } from 'vitest';
import {
	cropOfTrim,
	readGraphicsCrop,
	trimOfCrop,
	turnedCrop,
	writeGraphicsCrop
} from '$lib/editor/visual/extensions/image/crop/graphicsCrop';

describe('graphicsCrop', () => {
	it('reads trim in any unit as bp, with clip and angle', () => {
		const crop = readGraphicsCrop('width=0.8\\linewidth, trim={1in 0 72pt 2.54cm}, clip, angle=90');
		expect(crop.clip).toBe(true);
		expect(crop.angle).toBe(90);
		expect(crop.trim?.map((v) => Math.round(v * 100) / 100)).toEqual([72, 0, 71.73, 72]);
	});

	it('writes the angle first and keeps every other option in its order', () => {
		const out = writeGraphicsCrop('width=0.8\\linewidth, trim=1 2 3 4, clip, keepaspectratio', [66, 6, 11.04, 33], 270);
		expect(out).toBe('angle=270, width=0.8\\linewidth, keepaspectratio, trim=66 6 11 33, clip');
		expect(writeGraphicsCrop(out, null, 0)).toBe('width=0.8\\linewidth, keepaspectratio');
	});

	it('takes a crop drawn on the turned image back to the trim of the image before its turn', () => {
		const onImage = cropOfTrim([10, 0, 0, 20], 100, 200);
		const onScreen = turnedCrop(onImage, 1);
		expect(trimOfCrop(turnedCrop(onScreen, -1), 100, 200)).toEqual([10, 0, 0, 20]);
		// turned left, the top of the image is on the left
		expect(onScreen.l).toBe(onImage.t);
	});
});
