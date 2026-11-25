// one visual editor on its own: ?lang=latex|typst|markdown names the document opened from ?doc=<served path>, and
// window.__harness is what tests drive
import { mount } from 'svelte';
import '../../src/app.css';
import '$lib/theme';
import { loadSettings } from '$lib/settings';
import { installKeyDispatch } from '$lib/keybindings/keybindings.svelte';
import { registerKeybindingCommands } from '$lib/keybindings/keybindingCommands';
import HarnessApp from './HarnessApp.svelte';
import { bindEditorHistory } from './editorHistory';
import { harnessApi, type HarnessApi } from './harnessApi';
import { HarnessSession } from './harnessSession.svelte';

declare global {
	interface Window {
		__harness: HarnessApi;
		/** bound by the driver: a file the editor wrote */
		__harnessWrote?: (path: string, text: string) => void;
	}
}

const LANGUAGES = { latex: 'main.tex', typst: 'main.typ', markdown: 'main.md' } as const;

(window as unknown as { global: Window }).global = window;
// before any other keydown listener, so the app's keybindings (undo among them) decide first
installKeyDispatch(window);
registerKeybindingCommands();
bindEditorHistory();
window.addEventListener('error', (e) => console.error('[client error]', (e.error && e.error.stack) || e.error || e.message));
window.addEventListener('unhandledrejection', (e) => console.error('[client error]', e.reason));

void loadSettings().then(async () => {
	const session = new HarnessSession((path, text) => window.__harnessWrote?.(path, text));
	mount(HarnessApp, { target: document.getElementById('harness')!, props: { session } });
	window.__harness = harnessApi(session);
	const query = new URLSearchParams(location.search);
	const doc = query.get('doc');
	if (doc) {
		const name = LANGUAGES[(query.get('lang') ?? 'latex') as keyof typeof LANGUAGES] ?? LANGUAGES.latex;
		session.load({ root: '/harness', files: { [name]: await (await fetch(doc)).text() } });
		await session.open(name);
	}
});
