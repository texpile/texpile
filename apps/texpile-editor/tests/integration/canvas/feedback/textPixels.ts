// a paragraph's pixels in real screenshots: against the rows' own backing stores, and its edge sharpness against DOM text
import type { Page } from '@playwright/test';
import { inCanvas } from '../canvasPage';

/** gradient energy per unit of ink across x (vertical stems) and across y (horizontal stems, baselines) */
export type InkSharpness = { readonly gx: number; readonly gy: number };

export type RowPixels = { readonly inked: number; readonly same: number; readonly sharpness: InkSharpness };

const DOM_REFERENCE = 'test-dom-reference';

/** the window as the screen shows it: no clip and no emulation, which redraw it at another scale */
export async function screenShot(page: Page): Promise<string> {
	const cdp = await page.context().newCDPSession(page);
	const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false, fromSurface: true });
	await cdp.detach();
	return data;
}

/** the paragraph holding `needle`, or the DOM reference while it is shown: its sharpness, and for the canvas its inked
 * device px and how many of them the screen shows as the row holds them */
export function paragraphPixels(page: Page, png: string, needle: string): Promise<RowPixels> {
	return inCanvas(
		page,
		async ({ probe }, { png, needle, id }) => {
			const sharpnessOf = (data: Uint8ClampedArray, width: number, height: number) => {
				const luma = new Float32Array(width * height);
				const counts = new Uint32Array(256);
				for (let i = 0; i < luma.length; i++) {
					luma[i] = (data[4 * i] + data[4 * i + 1] + data[4 * i + 2]) / 3;
					counts[Math.round(luma[i])]++;
				}
				const ground = counts.indexOf(Math.max(...counts));
				let text = ground;
				for (const value of luma) if (Math.abs(value - ground) > Math.abs(text - ground)) text = value;
				const ink = luma.map((v) => Math.min(1, Math.abs(v - ground) / Math.max(1, Math.abs(text - ground))));
				let total = 0;
				let gx = 0;
				let gy = 0;
				for (let y = 0; y < height; y++)
					for (let x = 0; x < width; x++) {
						const i = y * width + x;
						total += ink[i];
						if (x + 1 < width) gx += (ink[i + 1] - ink[i]) ** 2;
						if (y + 1 < height) gy += (ink[i + width] - ink[i]) ** 2;
					}
				return { gx: gx / total, gy: gy / total };
			};
			const image = new Image();
			image.src = `data:image/png;base64,${png}`;
			await image.decode();
			const screen = new OffscreenCanvas(image.width, image.height).getContext('2d', { willReadFrequently: true })!;
			screen.drawImage(image, 0, 0);
			const dpr = devicePixelRatio;
			const reference = document.getElementById(id)?.querySelector('p');
			const box = reference ? reference.getBoundingClientRect() : probe.rectOfNode(probe.posOf(needle) - 1)!;
			const x0 = Math.ceil(box.left * dpr);
			const y0 = Math.ceil(box.top * dpr);
			const width = Math.floor(box.right * dpr) - x0;
			const height = Math.floor(box.bottom * dpr) - y0;
			const shown = screen.getImageData(x0, y0, width, height).data;
			const sharpness = sharpnessOf(shown, width, height);
			let inked = 0;
			let same = 0;
			if (!reference)
				for (const canvas of document.querySelectorAll<HTMLCanvasElement>('[data-canvas-content]')) {
					const rect = canvas.getBoundingClientRect();
					const left = Math.round(rect.left * dpr);
					const top = Math.round(rect.top * dpr);
					const from = { x: Math.max(x0, left), y: Math.max(y0, top) };
					const to = { x: Math.min(x0 + width, left + canvas.width), y: Math.min(y0 + height, top + canvas.height) };
					if (to.x <= from.x || to.y <= from.y) continue;
					const own = canvas.getContext('2d')!.getImageData(from.x - left, from.y - top, to.x - from.x, to.y - from.y).data;
					const ground = [own[0], own[1], own[2]];
					for (let y = from.y; y < to.y; y++)
						for (let x = from.x; x < to.x; x++) {
							const o = ((y - from.y) * (to.x - from.x) + (x - from.x)) * 4;
							const s = ((y - y0) * width + (x - x0)) * 4;
							if (Math.max(...[0, 1, 2].map((c) => Math.abs(own[o + c] - ground[c]))) <= 40) continue;
							inked++;
							if (Math.max(...[0, 1, 2].map((c) => Math.abs(own[o + c] - shown[s + c]))) <= 3) same++;
						}
				}
			return { inked, same, sharpness };
		},
		{ png, needle, id: DOM_REFERENCE }
	);
}

/** the paragraph again as DOM text over the canvas one, with the editor root's classes and the ground under it; fixed in
 * the page, where Chromium antialiases it like the opaque rows (in the scroller it goes grayscale at scale 1.5) */
export function showDomReference(page: Page, needle: string, text: string): Promise<void> {
	return inCanvas(
		page,
		({ probe }, { needle, text, id }) => {
			const box = probe.rectOfNode(probe.posOf(needle) - 1)!;
			const root = document.querySelector('[data-canvas-root]')!;
			let ground = '';
			for (let at = root.parentElement; at && !ground; at = at.parentElement) {
				const color = getComputedStyle(at).backgroundColor;
				if (color && !/^rgba\(.*, 0\)$|^transparent$/.test(color)) ground = color;
			}
			const reference = document.createElement('div');
			reference.id = id;
			for (const attr of root.attributes)
				if (attr.name !== 'style' && !attr.name.startsWith('data-canvas') && attr.name !== 'contenteditable')
					reference.setAttribute(attr.name, attr.value);
			// on a whole device pixel: Chromium keeps subpixel text only for a layer that sits on one
			const whole = (css: number) => Math.round(css * devicePixelRatio) / devicePixelRatio;
			reference.style.cssText = `position:fixed;left:${whole(box.left)}px;top:${whole(box.top)}px;width:${box.width}px;padding:0;margin:0;z-index:99999;background:${ground}`;
			// the text styles the editor root has, as the canvas root look draws them
			const paragraph = reference.appendChild(document.createElement('p'));
			paragraph.style.cssText =
				'margin:0;font-family:var(--editor-text-font, var(--typo-base--font-family));font-size:var(--text-base);' +
				'line-height:var(--leading-relaxed);font-variant-ligatures:none;white-space:break-spaces;overflow-wrap:break-word;color:var(--color-surface-950-50)';
			paragraph.textContent = text;
			document.body.appendChild(reference);
		},
		{ needle, text, id: DOM_REFERENCE }
	);
}

export function removeDomReference(page: Page): Promise<void> {
	return page.evaluate((id) => document.getElementById(id)?.remove(), DOM_REFERENCE);
}
