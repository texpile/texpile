import { expect, type Locator, type Page } from '@playwright/test';
import path from 'node:path';

// the dev server serves src/ as modules, so a test reaches the live editor the way the app's own code does
const VIEW = `(await import('/src/lib/stores/editorStore.ts')).editorViewStore.current`;

/** the ProseMirror visual editor: text is typed and clicked, the document is read back through the view */
export class VisualEditor {
	constructor(
		readonly page: Page,
		readonly root: string
	) {}

	path(rel: string): string {
		return path.join(this.root, rel);
	}

	get editor(): Locator {
		return this.page.locator('.ProseMirror').first();
	}

	get modeButtons(): { visual: Locator; source: Locator } {
		return {
			visual: this.page.getByRole('button', { name: 'Visual', exact: true }).first(),
			source: this.page.getByRole('button', { name: 'Source', exact: true }).first()
		};
	}

	/** opens a folder file and shows it in the visual editor */
	async open(rel: string): Promise<void> {
		await this.page.keyboard.press('Escape');
		// the view stays and its document is swapped once the new file is parsed: wait for another document
		const switching = await this.page.evaluate(async (file) => {
			const store = await import(/* @vite-ignore */ '/src/lib/workspace/workspaceStore.ts' as string);
			const editors = await import(/* @vite-ignore */ '/src/lib/stores/editorStore.ts' as string);
			const was = store.activeFilePath.current !== file;
			(window as unknown as { testPreviousDoc: unknown }).testPreviousDoc = was ? editors.editorViewStore.current?.state.doc : null;
			store.openFile(file);
			return was;
		}, this.path(rel));
		await this.showVisual();
		if (switching)
			await expect
				.poll(() => this.evalView<boolean>('return !!view && view.dom.isConnected && view.state.doc !== window.testPreviousDoc;'), {
					message: `the visual editor shows ${rel}`
				})
				.toBe(true);
		// a new view places its caret once more as it settles in; a person cannot click before that
		let last = '';
		await expect
			.poll(
				async () => {
					const now = await this.evalView<string>('return view ? view.state.selection.from + ":" + view.state.doc.content.size : "";');
					const settled = now !== '' && now === last;
					last = now;
					return settled;
				},
				{ intervals: [150], message: `the visual editor settles on ${rel}` }
			)
			.toBe(true);
	}

	async showVisual(): Promise<void> {
		const { visual } = this.modeButtons;
		await expect(visual).toBeVisible();
		if ((await visual.getAttribute('aria-pressed')) !== 'true') await visual.click();
		await expect(visual).toHaveAttribute('aria-pressed', 'true');
		await this.editor.waitFor();
		await expect.poll(() => this.evalView<boolean>(`return !!view && view.dom.isConnected;`)).toBe(true);
	}

	async showSource(): Promise<void> {
		const { source } = this.modeButtons;
		await expect(source).toBeVisible();
		if ((await source.getAttribute('aria-pressed')) !== 'true') await source.click();
		await expect(source).toHaveAttribute('aria-pressed', 'true');
		await this.page.locator('.cm-editor .cm-content').first().waitFor();
	}

	/** runs `body` with `view` (the ProseMirror EditorView) and `arg` */
	async evalView<T>(body: string, arg?: unknown): Promise<T> {
		return this.page.evaluate(
			async ({ body, arg, VIEW }) => {
				const view = await new Function(`return (async () => ${VIEW})()`)();
				return new Function('view', 'arg', body)(view, arg);
			},
			{ body, arg, VIEW }
		);
	}

	/** the document's text, blocks joined by a blank line */
	text(): Promise<string> {
		return this.evalView(`return view.state.doc.textBetween(0, view.state.doc.content.size, '\\n\\n', ' ');`);
	}

	/** the document's top-level node names */
	blockTypes(): Promise<string[]> {
		return this.evalView(`const out = []; view.state.doc.forEach((n) => out.push(n.type.name)); return out;`);
	}

	/** clicks into the paragraph holding `text` and puts the caret at the end of the document's text block */
	async caretAtEndOf(text: string): Promise<void> {
		const block = this.editor.locator('p', { hasText: text }).first();
		await block.click();
		await this.page.keyboard.press('End');
		// the editor reads the caret after a native move; a mark set before that read would be dropped by it
		await expect
			.poll(() => this.evalView<boolean>('const $h = view.state.selection.$head; return $h.parentOffset === $h.parent.content.size;'), {
				message: `the caret at the end of "${text}"`
			})
			.toBe(true);
	}

	/** puts the caret at the very end of the document, focused */
	async caretAtDocEnd(): Promise<void> {
		await this.evalView(
			`const S = view.state.selection.constructor;
			 view.focus();
			 view.dispatch(view.state.tr.setSelection(S.atEnd(view.state.doc)));`
		);
	}

	/** selects `text` inside the paragraph that holds it, through the view so the position is exact */
	async select(text: string): Promise<void> {
		await this.setRange(text, false);
	}

	/** puts the caret right after `text` */
	async caretAfter(text: string): Promise<void> {
		await this.setRange(text, true);
	}

	private async setRange(text: string, collapse: boolean): Promise<void> {
		const found = await this.evalView<boolean>(
			`let from = -1;
			 view.state.doc.descendants((node, pos) => {
				 if (from >= 0 || !node.isText) return;
				 const i = node.text.indexOf(arg.text);
				 if (i >= 0) from = pos + i;
			 });
			 if (from < 0) return false;
			 const S = view.state.selection.constructor;
			 view.focus();
			 const end = from + arg.text.length;
			 view.dispatch(view.state.tr.setSelection(S.create(view.state.doc, arg.collapse ? end : from, end)));
			 return true;`,
			{ text, collapse }
		);
		expect(found, `text ${JSON.stringify(text)} in the visual document`).toBe(true);
	}

	async type(text: string, delay = 30): Promise<void> {
		await this.page.keyboard.type(text, { delay });
	}

	// at a person's pace: ProseMirror reads the browser's caret after a native move, which a key pressed the same instant can beat
	async press(key: string): Promise<void> {
		await this.page.keyboard.press(key);
		await this.page.waitForTimeout(30);
	}

	/** the format bar's word count as shown, also while it reads "N of M words" with a selection */
	wordCount(): Locator {
		return this.page.getByText(/^[\d,]+ words?$|^[\d,]+ of [\d,]+ words?$/).first();
	}

	/** the top format bar's button, not the floating selection bar's twin */
	toolbarButton(name: string): Locator {
		return this.page.getByRole('button', { name, exact: true }).first();
	}
}
