// the canvas editor in the page (18.4): the active view's probe and the app's editor view, for the canvas specs
import { expect, type Page } from '@playwright/test';
import type { CanvasProbe, ProbeView } from '$lib/editor/canvas';
import type { EditorView } from 'prosemirror-view';

export type CanvasScope = { probe: ProbeView; view: EditorView };

/** runs `body` in the page; it is sent as source, so it reads only its arguments */
export function inCanvas<T, A = undefined>(page: Page, body: (scope: CanvasScope, arg: A) => T | Promise<T>, arg?: A): Promise<T> {
	return page.evaluate(
		async ({ source, arg }) => {
			const store = await import(/* @vite-ignore */ '/src/lib/stores/editorStore.ts' as string);
			const probe = (window as unknown as { __canvasProbe?: CanvasProbe }).__canvasProbe?.active();
			const view = store.editorViewStore.current as EditorView | null;
			if (!probe || !view) throw new Error('no canvas editor is mounted');
			const run = new Function(`return (${source})`)() as (scope: CanvasScope, arg: unknown) => unknown;
			return run({ probe, view }, arg);
		},
		{ source: body.toString(), arg }
	) as Promise<T>;
}

/** no layout, bitmap, formula or grammar pending in view */
export function settled(page: Page): Promise<void> {
	return inCanvas(page, ({ probe }) => probe.settle());
}

/** the probe is in every dev build: its absence means the window shows no canvas editor yet */
export function hasCanvasProbe(page: Page): Promise<boolean> {
	return page.evaluate(() => '__canvasProbe' in window);
}

export function probeErrors(page: Page): Promise<{ pos: number; type: string; message: string }[]> {
	return inCanvas(page, ({ probe }) => probe.errors());
}

/** every figure drawn from its file or shown missing: a picture still loading grows its block when it arrives */
export async function picturesSettled(page: Page): Promise<void> {
	await expect
		.poll(
			() =>
				inCanvas(page, ({ probe, view }) => {
					let figures = 0;
					view.state.doc.descendants((node) => void (node.type.name === 'image' && figures++));
					const drawn = probe.query('.imagePluginImg').filter((el) => el.rect.height > 0).length;
					return figures - drawn - probe.query('.image-missing').length;
				}),
			{ message: 'figures still loading' }
		)
		.toBeLessThanOrEqual(0);
}
