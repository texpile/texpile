import { expect, type ElectronApplication, type Locator, type Page } from '@playwright/test';

/** the Preferences dialog, driven the way a person uses it: the shortcut, the sidebar, the search box, the switches */
export class Preferences {
	readonly dialog: Locator;

	constructor(readonly page: Page) {
		this.dialog = page.getByRole('dialog').filter({ has: page.getByLabel('Search settings') });
	}

	async open(): Promise<void> {
		await this.page.keyboard.press('Control+Comma');
		await expect(this.dialog).toBeVisible();
	}

	async close(): Promise<void> {
		await this.page.keyboard.press('Escape');
		await expect(this.dialog).toBeHidden();
	}

	/** opens the dialog when it is closed */
	async ensureOpen(): Promise<void> {
		if (!(await this.dialog.isVisible())) await this.open();
	}

	nav(): Locator {
		return this.dialog.locator('nav');
	}

	header(): Locator {
		return this.dialog.locator('h2');
	}

	tab(name: string): Locator {
		return this.nav().getByRole('button', { name, exact: true });
	}

	async goTo(name: string): Promise<void> {
		await this.tab(name).click();
	}

	searchBox(): Locator {
		return this.dialog.getByLabel('Search settings');
	}

	async search(text: string): Promise<void> {
		await this.searchBox().fill(text);
	}

	resultRow(label: string): Locator {
		return this.dialog.getByRole('button', { name: label });
	}

	/** the row of a setting by its data id */
	row(id: string): Locator {
		return this.dialog.locator(`[data-pref-row="${id}"]`);
	}

	/** the switch of a row, by the label the row announces */
	switchFor(label: string): Locator {
		return this.dialog.getByRole('checkbox', { name: label, exact: true });
	}

	/** clicks the visible control of a switch, as a person would */
	async toggle(label: string): Promise<void> {
		const input = this.switchFor(label);
		const control = input.locator('xpath=ancestor::label[1]');
		await control.click();
	}

	/** true while the dialog's scrolling box in the sidebar or the body overflows */
	async navOverflows(): Promise<boolean> {
		return this.nav().evaluate((n) => n.scrollHeight > n.clientHeight + 1);
	}

	manage(): Locator {
		return this.dialog.getByRole('button', { name: 'Manage', exact: true });
	}

	/** puts the package file lists in the state given, the one thing the dialog keeps between openings */
	async setManage(open: boolean): Promise<void> {
		if ((await this.manage().getAttribute('aria-expanded')) !== String(open)) await this.manage().click();
		await expect(this.manage()).toHaveAttribute('aria-expanded', String(open));
	}
}

/** the command palette, opened with its shortcut and run by the label shown */
export async function runPaletteCommand(page: Page, label: string): Promise<void> {
	await page.keyboard.press('Control+k');
	await page.keyboard.type(label, { delay: 15 });
	const option = page.getByRole('option', { name: label, exact: true });
	await expect(option, `palette entry ${label}`).toBeVisible();
	await page.keyboard.press('Enter');
	await expect(option).toBeHidden();
}

/** the labels the palette offers for a query */
export async function paletteLabels(page: Page, query: string): Promise<string[]> {
	await page.keyboard.press('Control+k');
	await page.keyboard.type(query, { delay: 15 });
	await page.waitForTimeout(300);
	const labels = await page.getByRole('option').allInnerTexts();
	await page.keyboard.press('Escape');
	return labels.map((l) => l.trim());
}

/** the text of every toast on screen */
export function toasts(page: Page): Locator {
	return page.locator('[data-scope="toast"][data-part="root"]');
}

type Editor = { evalView<T>(body: string, arg?: unknown): Promise<T>; caretAfter(anchor: string, o?: { nth?: number }): Promise<void> };

/** puts text at the caret in one step, for a command a test will hover or check */
export async function insertAtCaret(source: Editor, anchor: string, text: string): Promise<void> {
	await source.caretAfter(anchor);
	await source.evalView('view.dispatch(view.state.replaceSelection(arg));', text);
}

type Completer = Editor & {
	type(text: string, delay?: number): Promise<void>;
	press(key: string): Promise<void>;
	text(): Promise<string>;
	restore(text: string): Promise<void>;
	completions(): Promise<{ label: string; detail: string }[]>;
};

/**
 * types after an anchor and returns the completion list once something shows and stops changing; the text is put back.
 * A window still loading its editor may drop the first trigger, so the last key is typed once more when nothing shows.
 */
export async function completeWhenShown(source: Completer, anchor: string, typed: string): Promise<{ label: string; detail: string }[]> {
	const before = await source.text();
	await source.caretAfter(anchor);
	await source.type(typed);
	let rows: { label: string; detail: string }[] = [];
	let last = '';
	let polls = 0;
	await expect
		.poll(
			async () => {
				rows = await source.completions();
				if (!rows.length && ++polls === 8) {
					await source.press('Backspace');
					await source.type(typed.slice(-1));
				}
				const now = JSON.stringify(rows);
				const settled = rows.length > 0 && now === last;
				last = now;
				return settled;
			},
			{ intervals: [300, 300, 300, 500, 800], timeout: 12_000, message: `a completion list after typing ${typed}` }
		)
		.toBe(true);
	await source.press('Escape');
	await source.restore(before);
	return rows;
}

/** the diagnostics whose message matches, polled until the editor's checks have run again */
export async function diagnosticsMatching(source: { diagnostics(): Promise<{ message: string }[]> }, pattern: RegExp): Promise<string[]> {
	return (await source.diagnostics()).map((d) => d.message).filter((m) => pattern.test(m));
}

export type BoxAsked = { message: string; buttons: string[] };

type Stubbed = { __boxAsked?: BoxAsked | null };

/** the next native message box answers with the button of this label, and its text is kept for boxAsked */
export async function answerNextMessageBox(app: ElectronApplication, label: string): Promise<void> {
	await app.evaluate(({ dialog }, label) => {
		const g = globalThis as unknown as Stubbed;
		const original = dialog.showMessageBox;
		const box = dialog as unknown as { showMessageBox: unknown };
		g.__boxAsked = null;
		box.showMessageBox = async (_win: unknown, o: { message: string; buttons: string[] }) => {
			g.__boxAsked = { message: o.message, buttons: o.buttons };
			box.showMessageBox = original;
			return { response: o.buttons.indexOf(label), checkboxChecked: false };
		};
	}, label);
}

export function boxAsked(app: ElectronApplication): Promise<BoxAsked | null> {
	return app.evaluate(() => (globalThis as unknown as Stubbed).__boxAsked ?? null);
}

/** the folder picker answers with this path (null cancels) for as long as the app runs */
export async function answerFolderDialog(app: ElectronApplication, folder: string | null): Promise<void> {
	await app.evaluate(({ dialog }, folder) => {
		(dialog as unknown as { showOpenDialog: unknown }).showOpenDialog = async () => ({
			canceled: folder === null,
			filePaths: folder === null ? [] : [folder]
		});
	}, folder);
}
