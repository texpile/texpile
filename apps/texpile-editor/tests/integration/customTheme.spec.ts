import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { Preferences, runPaletteCommand } from './driver/preferences';
import { useTexpile } from './driver/useTexpile';

const texpile = useTexpile();

// a 1x1 PNG
const DOT = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

function themesDir(): string {
	return path.join(texpile().userData, 'themes');
}

function primary(page: Page): Promise<string> {
	return page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--color-primary-500').trim());
}

/** the color a variable paints, a blend resolved */
function painted(page: Page, variable: string): Promise<string> {
	return page.evaluate((variable) => {
		const probe = document.body.appendChild(document.createElement('span'));
		probe.style.color = `var(${variable})`;
		const color = getComputedStyle(probe).color;
		probe.remove();
		return color;
	}, variable);
}

test.afterEach(() => {
	fs.rmSync(path.join(themesDir(), 'night-owl.css'), { force: true });
	fs.rmSync(path.join(themesDir(), 'night-owl'), { recursive: true, force: true });
});

test('a .css in the themes folder is a theme: picked in Appearance, its shades filled, its own image loads, a save restyles the window', async () => {
	const { page } = texpile();
	fs.mkdirSync(path.join(themesDir(), 'night-owl'), { recursive: true });
	fs.writeFileSync(path.join(themesDir(), 'night-owl', 'dot.png'), DOT);
	const file = path.join(themesDir(), 'night-owl.css');
	fs.writeFileSync(file, ':root { --color-primary-500: rgb(130, 170, 255); }\nbody { background-image: url(night-owl/dot.png); }\n');

	const before = await painted(page, '--color-primary-200');
	const prefs = new Preferences(page);
	await prefs.open();
	await page.getByRole('button', { name: 'Night Owl' }).click();
	await expect.poll(() => primary(page)).toBe('rgb(130, 170, 255)');
	// the theme sets one shade: the rest blend from it, and text on the light blue turns black
	expect(await painted(page, '--color-primary-200')).not.toBe(before);
	expect(await painted(page, '--color-primary-contrast-500')).toBe('oklch(0 0 0)');
	const image = await page.evaluate(async () => {
		const url = getComputedStyle(document.body).backgroundImage.slice(5, -2);
		const img = new Image();
		img.src = url;
		await img.decode();
		return url;
	});
	expect(image).toBe('texpile-theme://themes/night-owl/dot.png');

	fs.writeFileSync(file, ':root { --color-primary-500: rgb(200, 10, 10); }\n');
	await expect.poll(() => primary(page)).toBe('rgb(200, 10, 10)');

	await prefs.close();
	await runPaletteCommand(page, 'Use Default Theme');
	await expect.poll(() => primary(page)).not.toBe('rgb(200, 10, 10)');
});
