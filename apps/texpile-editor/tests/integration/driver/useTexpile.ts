import { expect, test } from '@playwright/test';
import { openCanvasHarness, type HarnessBrowser } from './canvasHarness';
import { launchTexpile, type LaunchOptions, type TexpileWindow } from './launch';
import { SourceEditor } from './sourceEditor';

export type TexpileSession = TexpileWindow & { source: SourceEditor };

/** one window per spec file, opened again after a failed test; a test fails on any page or console error it caused.
 *  In the canvas-* projects the window is a page of the canvas harness in a browser instead of Electron */
export function useTexpile(options: LaunchOptions & { expectedErrors?: RegExp } = {}): () => TexpileSession {
	let session: TexpileSession | null = null;
	test.beforeAll(async () => {
		// three windows opening on a cold dev server take minutes
		test.setTimeout(300_000);
		const { name, use } = test.info().project;
		const window = name.startsWith('canvas-')
			? await openCanvasHarness(
					{ ...options, hideEditContext: options.hideEditContext || name === 'canvas-textarea' },
					use.browserName as HarnessBrowser,
					!!use.hasTouch
				)
			: await launchTexpile(options);
		session = Object.assign(window, { source: new SourceEditor(window.page, window.root) });
		expect(window.takeErrors(), 'errors while the window opened').toEqual([]);
	});
	test.afterEach(async () => {
		const testInfo = test.info();
		if (!session) return;
		if (testInfo.status !== testInfo.expectedStatus)
			await testInfo.attach('window', { body: await session.page.screenshot(), contentType: 'image/png' });
		const { expectedErrors } = options;
		expect(
			session.takeErrors().filter((error) => !expectedErrors?.test(error)),
			'page or console errors'
		).toEqual([]);
	});
	test.afterAll(async () => {
		await session?.close();
		session = null;
	});
	return () => {
		if (!session) throw new Error('the window did not open');
		return session;
	};
}
