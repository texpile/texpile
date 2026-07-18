// Browser entry for the live-mode harness: installs a window.texpileNative shim that
// proxies the Electron bridge calls to the HTTP engine server (server.mjs), rewrites
// texfile:// fetches the same way, and mounts the REAL DraftView. The matrix driver
// talks to window.__live from Playwright.
/* eslint-disable @typescript-eslint/no-explicit-any -- shims the untyped window bridge */
import { mount, unmount } from 'svelte';
// the app stylesheet: DraftView's layout (flex column, overflow-auto scroller) is Tailwind
// utilities from the global sheet -- without it the scroller grows to content height and
// the viewport windowing sees every page as visible
import '../../src/app.css';
import DraftView from '$lib/draft/DraftView.svelte';
import { decideEdit } from '$lib/draft/dispatch';

const SRV = 'http://localhost:8099';
const origFetch = window.fetch.bind(window);
// texfile:// is the Electron protocol; in plain Chromium route it to the bridge
window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
	const u = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
	if (typeof u === 'string' && u.startsWith('texfile://')) {
		const q = u.split('?path=')[1] ?? '';
		return origFetch(`${SRV}/file?path=${q}`, init);
	}
	return origFetch(input as RequestInfo, init);
}) as typeof window.fetch;

const post = async (p: string, body: unknown) => {
	const r = await origFetch(SRV + p, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body ?? {})
	});
	return r.json();
};

(window as any).texpileNative = {
	draftCompile: (b: unknown) => post('/compile', b),
	draftTypeset: (b: unknown) => post('/typeset', b),
	synctex: (b: unknown) => post('/synctex', b),
	draftStop: () => post('/stop', {}),
	draftSavePdf: async () => ({ ok: false, error: 'harness' })
};

const props = $state({ root: '', mainFile: 'main.tex', trigger: 0 });
let comp: any = null;

(window as any).__live = {
	// fresh component per fixture: no cross-fixture in-flight state, caches, or patches
	async open(root: string) {
		if (comp) {
			await unmount(comp);
			comp = null;
			(window as any).__draftEvents = [];
		}
		props.root = root;
		props.trigger = 0;
		comp = mount(DraftView, { target: document.getElementById('app')!, props });
		props.trigger++;
	},
	recompile() {
		props.trigger++;
	},
	decide: decideEdit,
	// onRecompile mirrors the app: write the buffer to disk so the pass the component
	// fires (abandon/reconcile) compiles the edited source
	patch(req: any, root: string, buffer: string) {
		return comp.instantPatch({ ...req, file: 'main.tex', onRecompile: () => post('/write', { root, content: buffer }) });
	},
	events: () => ((window as any).__draftEvents ?? []).splice(0)
};
