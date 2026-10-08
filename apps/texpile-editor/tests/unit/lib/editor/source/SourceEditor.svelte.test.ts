// @vitest-environment jsdom
import { it, expect, afterEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import SourceEditor from '../../../../../src/lib/editor/source/SourceEditor.svelte';
import { sourceCmView } from '../../../../../src/lib/stores/editorStore';

const apps: Record<string, unknown>[] = [];
// main.ts sets this up in the app
(window as unknown as { texpile: { debug: Record<string, unknown> } }).texpile = { debug: {} };
afterEach(() => {
	for (const app of apps.splice(0)) unmount(app);
	document.body.innerHTML = '';
	sourceCmView.current = null;
});

function editor(live: { current: boolean }) {
	const target = document.body.appendChild(document.createElement('div'));
	const props = $state({ value: '\\section{A}\n', live: live.current, docPath: '/p/main.tex' });
	apps.push(mount(SourceEditor, { target, props }));
	flushSync();
	return { target, setLive: (on: boolean) => ((props.live = on), flushSync()) };
}

// a slot that goes live after it was drawn parked is the one menus and the keyboard reach
it('hands the app source editor over when focus moves between slots', () => {
	const left = editor({ current: true });
	const right = editor({ current: false });
	expect(left.target.contains(sourceCmView.current!.dom)).toBe(true);
	left.setLive(false);
	right.setLive(true);
	expect(right.target.contains(sourceCmView.current!.dom)).toBe(true);
	right.setLive(false);
	left.setLive(true);
	expect(left.target.contains(sourceCmView.current!.dom)).toBe(true);
});
