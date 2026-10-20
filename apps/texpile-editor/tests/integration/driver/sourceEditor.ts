import { expect, type Page } from '@playwright/test';
import path from 'node:path';

export type CompletionRow = { label: string; detail: string };
export type DiagnosticRow = { line: number; text: string; message: string; severity: string };

// the dev server serves src/ as modules, so a test reaches the live editor the way the app's own code does
const VIEW = `(await import('/src/lib/stores/editorStore.ts')).sourceCmView.current`;

/** the CodeMirror source editor: caret placed through the view, everything else typed and clicked */
export class SourceEditor {
	constructor(
		readonly page: Page,
		readonly root: string
	) {}

	path(rel: string): string {
		return path.join(this.root, rel);
	}

	/** opens a folder file and shows it in the source editor */
	async open(rel: string): Promise<void> {
		await this.page.keyboard.press('Escape');
		// the previous file's view stays mounted until the new one is ready: mark it, then wait for another
		const switching = await this.page.evaluate(
			async ({ file, store, editors }) => {
				const workspace = await import(/* @vite-ignore */ store);
				const was = workspace.activeFilePath.current !== file;
				if (was) (await import(/* @vite-ignore */ editors)).sourceCmView.current?.dom.setAttribute('data-test-previous', '');
				workspace.openFile(file);
				return was;
			},
			{ file: this.path(rel), store: '/src/lib/workspace/workspaceStore.ts', editors: '/src/lib/stores/editorStore.ts' }
		);
		const source = this.page.getByRole('button', { name: 'Source', exact: true }).first();
		await expect(source).toBeVisible();
		if ((await source.getAttribute('aria-pressed')) !== 'true') await source.click();
		await this.page.locator('.cm-editor .cm-content').first().waitFor();
		await expect
			.poll(
				() =>
					this.evalView<boolean>(
						`return !!view && view.dom.isConnected && !(${switching} && view.dom.hasAttribute('data-test-previous'));`
					),
				{ message: `the source editor shows ${rel}` }
			)
			.toBe(true);
	}

	/** runs `body` with `view` (the CodeMirror EditorView) and `arg` */
	async evalView<T>(body: string, arg?: unknown): Promise<T> {
		return this.page.evaluate(
			async ({ body, arg, VIEW }) => {
				const view = await new Function(`return (async () => ${VIEW})()`)();
				return new Function('view', 'arg', body)(view, arg);
			},
			{ body, arg, VIEW }
		);
	}

	text(): Promise<string> {
		return this.evalView('return view.state.doc.toString();');
	}

	/** puts the caret after the nth `anchor`, dropping the `replace` characters after it */
	async caretAfter(anchor: string, { nth = 0, replace = 0 } = {}): Promise<void> {
		const at = await this.evalView<number>(
			`const doc = view.state.doc.toString(); let at = -1;
			 for (let i = 0; i <= arg.nth; i++) { at = doc.indexOf(arg.anchor, at + 1); if (at < 0) return -1; }
			 at += arg.anchor.length;
			 view.dispatch({ changes: { from: at, to: at + arg.replace }, selection: { anchor: at }, scrollIntoView: true });
			 view.focus(); return at;`,
			{ anchor, nth, replace }
		);
		expect(at, `anchor ${JSON.stringify(anchor)} in the document`).toBeGreaterThanOrEqual(0);
	}

	/** clicks just after `anchor`, so the caret moves by the mouse */
	async clickAfter(anchor: string): Promise<void> {
		const c = await this.evalView<{ x: number; y: number } | null>(
			`const at = view.state.doc.toString().indexOf(arg); if (at < 0) return null;
			 const c = view.coordsAtPos(at + arg.length); return c && { x: c.left + 1, y: (c.top + c.bottom) / 2 };`,
			anchor
		);
		expect(c, `anchor ${JSON.stringify(anchor)} on screen`).not.toBeNull();
		await this.page.mouse.click(c!.x, c!.y);
	}

	async type(text: string, delay = 40): Promise<void> {
		await this.page.keyboard.type(text, { delay });
	}

	async press(key: string): Promise<void> {
		await this.page.keyboard.press(key);
	}

	/** the completion list as shown, empty when none is open */
	async completions(): Promise<CompletionRow[]> {
		return this.page.evaluate(() =>
			[...document.querySelectorAll('.cm-tooltip-autocomplete li')].map((li) => ({
				label: li.querySelector('.cm-completionLabel')?.textContent ?? li.textContent ?? '',
				detail: li.querySelector('.cm-completionDetail')?.textContent ?? ''
			}))
		);
	}

	/** types `typed` after `anchor` and returns the list once it settles; the text is put back after */
	async completeAfter(anchor: string, typed: string, { nth = 0, explicit = false } = {}): Promise<CompletionRow[]> {
		const before = await this.text();
		await this.caretAfter(anchor, { nth });
		await this.type(typed);
		if (explicit) await this.press('Control+Space');
		let rows: CompletionRow[] = [];
		let last = '';
		await expect
			.poll(
				async () => {
					rows = await this.completions();
					const now = JSON.stringify(rows);
					const settled = now === last;
					last = now;
					return settled;
				},
				{ intervals: [400, 400, 400, 600, 800], timeout: 6000 }
			)
			.toBe(true)
			.catch(() => {});
		await this.press('Escape');
		await this.restore(before);
		return rows;
	}

	/** sets the whole text back, for putting a test's own edits away */
	async restore(text: string): Promise<void> {
		await this.evalView(
			'if (view.state.doc.toString() !== arg) view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: arg } });',
			text
		);
	}

	/** hovers the character `offset` into the nth `anchor` and returns the tooltip text */
	async hover(anchor: string, { offset = 2, nth = 0 } = {}): Promise<string> {
		await this.page.mouse.move(2, 2);
		const pos = await this.evalView<number>(
			`const doc = view.state.doc.toString(); let at = -1;
			 for (let i = 0; i <= arg.nth; i++) { at = doc.indexOf(arg.anchor, at + 1); if (at < 0) return -1; }
			 const pos = at + arg.offset; view.dispatch({ effects: view.constructor.scrollIntoView(pos, { y: 'center' }) }); return pos;`,
			{ anchor, offset, nth }
		);
		expect(pos, `anchor ${JSON.stringify(anchor)} in the document`).toBeGreaterThanOrEqual(0);
		await this.page.waitForTimeout(250);
		const c = await this.evalView<{ x: number; y: number } | null>(
			'const c = view.coordsAtPos(arg); return c && { x: (c.left + c.right) / 2 + 2, y: (c.top + c.bottom) / 2 };',
			pos
		);
		expect(c).not.toBeNull();
		await this.page.mouse.move(c!.x - 40, c!.y + 40);
		await this.page.mouse.move(c!.x, c!.y, { steps: 4 });
		let text = '';
		await expect
			.poll(
				async () =>
					(text = await this.page
						.locator('.cm-tooltip-hover')
						.allInnerTexts()
						.then((t) => t.join(' | '))),
				{ timeout: 8000 }
			)
			.not.toBe('')
			.catch(() => {});
		await this.page.mouse.move(2, 2);
		return text;
	}

	/** the argument hint shown now, '' when none */
	hint(): Promise<string> {
		return this.page
			.locator('.cm-argument-hint')
			.allInnerTexts()
			.then((t) => t.join(' | '));
	}

	/** every diagnostic in the editor's lint state */
	async diagnostics(): Promise<DiagnosticRow[]> {
		return this.page.evaluate(async (editorStore) => {
			// the app's own instance of @codemirror/lint: another URL would be a second module with its own state field
			const url = performance
				.getEntriesByType('resource')
				.map((e) => e.name)
				.find((n) => n.includes('/node_modules/.vite/deps/@codemirror_lint.js'));
			if (!url) throw new Error('@codemirror/lint is not loaded');
			const { forEachDiagnostic } = await import(/* @vite-ignore */ url);
			const view = (await import(/* @vite-ignore */ editorStore)).sourceCmView.current;
			const rows: DiagnosticRow[] = [];
			forEachDiagnostic(view.state, (d: { message: string; severity: string }, from: number) => {
				const line = view.state.doc.lineAt(from);
				rows.push({ line: line.number, text: line.text, message: d.message, severity: d.severity });
			});
			return rows;
		}, '/src/lib/stores/editorStore.ts');
	}
}
