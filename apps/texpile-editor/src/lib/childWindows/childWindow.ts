// An OS window that is not a second app: window.open('about:blank') from this page gives a same-origin child in
// this renderer, so components mounted into it keep every store, socket and callback they have here. The main
// process allows only the names it knows (setWindowOpenHandler in electron/src/windows/createWindow.ts)
import { mount, unmount } from 'svelte';
import TooltipHost from '$lib/components/TooltipHost.svelte';
import ContextMenuHost from '$lib/menus/ContextMenuHost.svelte';
import { childWindows } from './childWindowRegistry.svelte';

export type ChildWindow = {
	win: Window;
	/** fills the window's body */
	target: HTMLElement;
	/** closes the window; `onGone` is not called for it */
	close(): void;
};

type ChildWindowOptions = {
	name: string;
	title: string;
	/** window.open's features: left, top, width, height */
	features?: string;
	/** the user closed the window */
	onGone: () => void;
};

const STYLE = 'style, link[rel="stylesheet"]';

/** the opener's styles in `doc`, kept in step one node at a time: lazy chunks add theirs late, Vite rewrites them on
 *  HMR, and the editors rewrite their highlight rules on every selection, which must not copy all of them again */
function mirrorStyles(doc: Document): () => void {
	const clones = new Map<Node, Element>();
	function add(node: Element): void {
		const c = node.cloneNode(true) as Element;
		clones.set(node, c);
		doc.head.appendChild(c);
	}
	for (const node of document.head.querySelectorAll(STYLE)) add(node);
	const observer = new MutationObserver((records) => {
		for (const r of records) {
			for (const node of r.removedNodes) {
				clones.get(node)?.remove();
				clones.delete(node);
			}
			for (const node of r.addedNodes) if (node instanceof Element && node.matches(STYLE)) add(node);
			// a rule's text changed: its <style> is the record's target, or the text node's parent
			const owner = r.target instanceof Element ? r.target : r.target.parentElement;
			const c = owner && clones.get(owner);
			if (c && owner.tagName === 'STYLE') c.textContent = owner.textContent;
		}
	});
	observer.observe(document.head, { childList: true, subtree: true, characterData: true });
	return () => observer.disconnect();
}

// the constructed sheets each shadow root here was given: one moved into another document loses them
const shadowSheets = new WeakMap<ShadowRoot, readonly CSSStyleSheet[]>();
let recording = false;
function recordShadowSheets(): void {
	const own = Object.getOwnPropertyDescriptor(ShadowRoot.prototype, 'adoptedStyleSheets');
	if (recording || !own?.set) return;
	recording = true;
	const set = own.set;
	Object.defineProperty(ShadowRoot.prototype, 'adoptedStyleSheets', {
		...own,
		set(this: ShadowRoot, sheets: CSSStyleSheet[]) {
			shadowSheets.set(this, sheets);
			set.call(this, sheets);
		}
	});
}

/**
 * MathLive styles a field through its shadow root's constructed sheets, given while the field is made here; put into a
 * window of its own, the browser drops them, as a sheet stays with the document that made it. Copies made there go back
 */
function restoreShadowSheets(win: Window & typeof globalThis): () => void {
	const copies = new WeakMap<CSSStyleSheet, CSSStyleSheet>();
	function copyOf(sheet: CSSStyleSheet): CSSStyleSheet {
		let copy = copies.get(sheet);
		if (!copy) {
			copy = new win.CSSStyleSheet();
			copy.replaceSync([...sheet.cssRules].map((r) => r.cssText).join('\n'));
			copies.set(sheet, copy);
		}
		return copy;
	}
	function restore(el: Element): void {
		const root = el.shadowRoot;
		const sheets = root && shadowSheets.get(root);
		if (root && sheets?.length && !root.adoptedStyleSheets.length) root.adoptedStyleSheets = sheets.map(copyOf);
	}
	const observer = new MutationObserver((records) => {
		for (const r of records)
			for (const node of r.addedNodes) {
				if (!(node instanceof Element)) continue;
				restore(node);
				for (const el of node.querySelectorAll('*')) restore(el);
			}
	});
	observer.observe(win.document, { childList: true, subtree: true });
	return () => observer.disconnect();
}

/** theme lives as attributes on the opener's <html> (theme-init.js) */
function syncTheme(doc: Document): void {
	const src = document.documentElement;
	const dst = doc.documentElement;
	dst.className = src.className;
	for (const a of ['data-theme', 'data-mode']) {
		const v = src.getAttribute(a);
		if (v === null) dst.removeAttribute(a);
		else dst.setAttribute(a, v);
	}
}

/** null when the window was not allowed */
export function openChildWindow(o: ChildWindowOptions): ChildWindow | null {
	const win = window.open('about:blank', o.name, o.features);
	if (!win) return null;
	const doc = win.document;
	// an element made in the child's own realm fails every `instanceof HTMLElement` here; VS Code forbids them outright
	doc.createElement = document.createElement.bind(document) as Document['createElement'];
	doc.createElementNS = document.createElementNS.bind(document) as Document['createElementNS'];
	recordShadowSheets();
	const stopShadowSheets = restoreShadowSheets(win as Window & typeof globalThis);
	doc.title = o.title;
	// about:blank resolves relative URLs against nothing; the cloned fonts and stylesheets keep relative paths
	const base = doc.createElement('base');
	base.href = document.baseURI;
	doc.head.appendChild(base);
	const reset = doc.createElement('style');
	reset.textContent = 'html,body{height:100%;margin:0}';
	doc.head.appendChild(reset);
	const stopStyles = mirrorStyles(doc);
	syncTheme(doc);
	const themeObserver = new MutationObserver(() => syncTheme(doc));
	themeObserver.observe(document.documentElement, { attributes: true });

	const target = doc.createElement('div');
	target.style.height = '100%';
	doc.body.appendChild(target);
	// hover hints and menus are drawn per window; without hosts here they painted in the main window
	const tips = mount(TooltipHost, { target: doc.body, props: { win } });
	const menus = mount(ContextMenuHost, { target: doc.body, props: { win } });
	const forget = childWindows.add(win);

	let gone = false;
	// pagehide is the close signal for an about:blank document; the interval covers a window the main process closed
	const watch = setInterval(() => {
		if (win.closed) settle();
	}, 500);
	win.addEventListener('pagehide', settle);
	function dispose(): void {
		gone = true;
		forget();
		stopStyles();
		stopShadowSheets();
		themeObserver.disconnect();
		clearInterval(watch);
		try {
			unmount(tips);
			unmount(menus);
		} catch (e) {
			console.error('child window unmount:', e);
		}
	}
	function settle(): void {
		if (gone) return;
		dispose();
		o.onGone();
	}

	return {
		win,
		target,
		close() {
			if (gone) return;
			dispose();
			try {
				win.close();
			} catch {
				/* already closed */
			}
		}
	};
}
