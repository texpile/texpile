// Louis's feedback 1: each pop-up the canvas opens lands where the DOM editor put it beside its anchor
import { expect, test, type Page } from '@playwright/test';
import { useTexpile } from '../../driver/useTexpile';
import { VisualEditor } from '../../driver/visualEditor';
import { inCanvas, probeErrors, settled } from '../canvasPage';

const FILLER = Array.from({ length: 30 }, (_, i) => `Filler paragraph ${i + 1} that stands above the words a writer opens pop-ups on.`);
const TARGET = 'A sentence with a misspeled word and some other words to select.';
const FILES: Record<string, string> = {
	'popups.tex': [
		'\\documentclass{article}',
		'\\begin{document}',
		...FILLER,
		TARGET,
		'\\href{https://example.org}{a link to follow}',
		...FILLER,
		'\\end{document}',
		''
	].join('\n\n'),
	'popups.typ': [...FILLER, TARGET, '#link("https://example.org")[a link to follow]', ...FILLER, ''].join('\n\n'),
	'popups.md': [...FILLER, TARGET, '[a link to follow](https://example.org)', ...FILLER, ''].join('\n\n')
};
// the DOM editor's offsets from each anchor, measured on canvas/p0-dom
const SPELL_BORDER = 2;
const SPELL_GAP = 5;
const LINK_GAP = 8;
const PILL_GAP = 6;
const PILL_HEIGHT = 26;
const HANDLE_GUTTER = 48;
const HANDLE_BUTTON = 22;
const MENU_EDGE = 8;
const PX = 2;

type Box = { left: number; top: number; right: number; bottom: number; width: number; height: number };

function boxOf(page: Page, selector: string): Promise<Box | null> {
	return page.evaluate((sel) => {
		const shown = [...document.querySelectorAll<HTMLElement>(sel)].find((el) => {
			const r = el.getBoundingClientRect();
			const style = getComputedStyle(el);
			return r.width > 0 && r.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
		});
		if (!shown) return null;
		const { left, top, right, bottom, width, height } = shown.getBoundingClientRect();
		return { left, top, right, bottom, width, height };
	}, selector);
}

/** the box once its entrance transition has ended (the spell box flies in 8 px): two reads in a row agree */
async function settledBoxOf(page: Page, selector: string): Promise<Box> {
	let last: Box | null = null;
	await expect
		.poll(
			async () => {
				const box = await boxOf(page, selector);
				const same = !!box && !!last && box.left === last.left && box.top === last.top && box.height === last.height;
				last = box;
				return same;
			},
			{ intervals: [100] }
		)
		.toBe(true);
	return last!;
}

/** once the text stands still: a narrow window glides it aside for the composer and back after */
async function untilTextStill(page: Page): Promise<void> {
	let last: number | null = null;
	await expect
		.poll(
			async () => {
				const left = await inCanvas(page, ({ view }) => view.canvas.sheetClientRect().left);
				const same = left === last;
				last = left;
				return same;
			},
			{ intervals: [150] }
		)
		.toBe(true);
}

/** the needle's text box and its first caret, with the needle scrolled to `reveal` first unless it is null */
function centerOn(page: Page, needle: string, length = needle.length, reveal: 'center' | null = 'center') {
	return inCanvas(
		page,
		async ({ probe, view }, arg) => {
			const from = probe.posOf(arg.needle);
			if (arg.reveal) view.canvas.revealPos(from, arg.reveal);
			await probe.settle();
			const rects = view.canvas.rangeClientRects(from, from + arg.length, 'text');
			const caret = view.coordsAtPos(from);
			return {
				from,
				text: {
					left: Math.min(...rects.map((r) => r.left)),
					right: Math.max(...rects.map((r) => r.right)),
					top: Math.min(...rects.map((r) => r.top)),
					bottom: Math.max(...rects.map((r) => r.bottom))
				},
				caret: { left: caret.left, top: caret.top, bottom: caret.bottom },
				column: view.canvas.sheetClientRect().left,
				innerHeight
			};
		},
		{ needle, length, reveal }
	);
}

/** the rule for the spell box and the link tooltip: under the anchor, else over it where the window ends */
function placedBelow(anchorBottom: number, gap: number, height: number, windowHeight: number, anchorTop = anchorBottom): number {
	const below = anchorBottom + gap;
	return Math.max(10, below + height > windowHeight ? anchorTop - height - gap : below);
}

async function closePopups(page: Page): Promise<void> {
	await page.keyboard.press('Escape');
	await page.mouse.move(2, 400);
}

for (const scale of [1.25, 1.5]) {
	test.describe(`at ${scale * 100} percent`, () => {
		const texpile = useTexpile({
			files: FILES,
			settings: { spellcheck: true },
			scale,
			// a commenter git can name, so the composer opens without asking for one
			env: { GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'user.name', GIT_CONFIG_VALUE_0: 'Writer' }
		});

		for (const file of Object.keys(FILES)) {
			test(`${file}: pop-ups land beside their anchors`, async () => {
				const visual = new VisualEditor(texpile().page, texpile().root);
				const { page } = visual;
				expect(await page.evaluate(() => devicePixelRatio)).toBe(scale);
				await visual.open(file);
				await settled(page);

				// the spell box: under its word, and gone once the text scrolls
				const word = await centerOn(page, 'misspeled');
				await expect
					.poll(
						() =>
							inCanvas(
								page,
								({ view }, at) => {
									let flagged = false;
									view.someProp('decorations', (f) =>
										f(view.state)?.forEachSet((set) => {
											flagged ||= set.find(at, at + 1, (spec: { errors?: unknown }) => !!spec.errors).length > 0;
										})
									);
									return flagged;
								},
								word.from
							),
						{ message: 'harper flags the misspelled word', timeout: 30_000 }
					)
					.toBe(true);
				await page.mouse.click((word.text.left + word.text.right) / 2, (word.text.top + word.text.bottom) / 2);
				const spell = await settledBoxOf(page, '#harper-suggestion-container .card');
				const flagged = await centerOn(page, 'misspeled', 'misspeled'.length, null);
				expect(Math.abs(spell.left - flagged.text.left), 'the spell box starts at its word').toBeLessThanOrEqual(PX);
				const spellTop = placedBelow(
					flagged.text.bottom + SPELL_BORDER,
					SPELL_GAP,
					spell.height,
					flagged.innerHeight,
					flagged.text.top - SPELL_BORDER
				);
				expect(Math.abs(spell.top - spellTop), 'the spell box hangs under its word, or over it where the window ends').toBeLessThanOrEqual(
					PX
				);
				// beside the box: one opened over the word covers it
				await page.mouse.move(spell.left - 20, (flagged.text.top + flagged.text.bottom) / 2);
				await page.mouse.wheel(0, 120);
				await expect
					.poll(() => boxOf(page, '#harper-suggestion-container .card'), { message: 'scrolling closes the spell box' })
					.toBeNull();
				await closePopups(page);

				// the link tooltip, under the link's first caret
				const link = await centerOn(page, 'a link to follow');
				await page.mouse.click(link.text.left + 20, (link.text.top + link.text.bottom) / 2);
				const tooltip = await settledBoxOf(page, '.z-tooltip[role=dialog]');
				const linked = await centerOn(page, 'a link to follow', 'a link to follow'.length, null);
				expect(Math.abs(tooltip.left - linked.caret.left), 'the link tooltip starts at the link').toBeLessThanOrEqual(PX);
				const tooltipTop = placedBelow(linked.caret.bottom, LINK_GAP, tooltip.height, linked.innerHeight);
				expect(Math.abs(tooltip.top - tooltipTop), 'the link tooltip hangs under it').toBeLessThanOrEqual(PX);
				await closePopups(page);

				// the comment pill, centered over a double-clicked word, and staying on it as the text scrolls
				const other = await centerOn(page, 'other');
				await page.mouse.dblclick((other.text.left + other.text.right) / 2, (other.text.top + other.text.bottom) / 2);
				await expect.poll(() => boxOf(page, '.cm-comment-add-row.cm-comment-add-visible')).not.toBeNull();
				const pill = await settledBoxOf(page, '.cm-comment-add-row');
				const selected = await centerOn(page, 'other', 'other'.length, null);
				const center = (selected.text.left + selected.text.right) / 2;
				expect(Math.abs((pill.left + pill.right) / 2 - center), 'the pill is centered over the word').toBeLessThanOrEqual(PX);
				expect(Math.abs(pill.top - (selected.caret.top - PILL_HEIGHT - PILL_GAP)), 'the pill sits over the line').toBeLessThanOrEqual(PX);
				await page.mouse.move(other.text.right + 300, other.text.bottom + 80);
				await page.mouse.wheel(0, 100);
				await settled(page);
				const moved = await inCanvas(page, ({ view }, from) => view.coordsAtPos(from).top, other.from);
				const followed = (await boxOf(page, '.cm-comment-add-row'))!;
				expect(Math.abs(followed.top - (moved - PILL_HEIGHT - PILL_GAP)), 'the pill follows its word').toBeLessThanOrEqual(PX);

				// its comment button opens the composer in the margin, level with the word (a narrow window glides the text to it)
				await page.locator('.cm-comment-add-row button.cm-comment-add:not([hidden])').first().click();
				const composer = await settledBoxOf(page, '.comment-card-pending');
				const glided = await inCanvas(page, ({ view }, from) => view.coordsAtPos(from).top, other.from);
				expect(Math.abs(composer.top - glided), 'the composer is level with the word').toBeLessThanOrEqual(PX);
				await page.locator('.comment-card-pending textarea').press('Escape');
				await closePopups(page);
				await page.mouse.click(2, 400);
				await untilTextStill(page);

				// the block handle, level with the hovered paragraph's first line, in the gutter
				const target = await centerOn(page, 'A sentence with');
				await page.mouse.move(target.text.left + 60, target.text.top + 2);
				await page.mouse.move(target.text.left + 64, (target.text.top + target.text.bottom) / 2);
				const handle = await settledBoxOf(page, '.block-handle-gutter');
				const hovered = await centerOn(page, 'A sentence with', 'A sentence with'.length, null);
				expect(Math.abs(handle.left - (hovered.column - HANDLE_GUTTER)), 'the handle stands in the gutter').toBeLessThanOrEqual(PX);
				const middle = (hovered.text.top + hovered.text.bottom) / 2;
				expect(Math.abs(handle.top - (middle - HANDLE_BUTTON / 2)), 'the handle is level with the first line').toBeLessThanOrEqual(PX);
				await closePopups(page);

				// the context menu, at the pointer
				const at = { x: target.text.left + 30, y: (target.text.top + target.text.bottom) / 2 };
				await page.mouse.click(at.x, at.y, { button: 'right' });
				const menu = await settledBoxOf(page, '[role=menu]');
				expect(Math.abs(menu.left - at.x), 'the menu opens at the pointer').toBeLessThanOrEqual(PX);
				// ContextMenuHost's rule: at the pointer, else up to 8 px over the window's foot
				const menuTop = Math.min(at.y, target.innerHeight - menu.height - MENU_EDGE);
				expect(Math.abs(menu.top - menuTop), 'the menu hangs from the pointer').toBeLessThanOrEqual(PX);
				await closePopups(page);

				expect(await probeErrors(page)).toEqual([]);
			});
		}
	});
}
