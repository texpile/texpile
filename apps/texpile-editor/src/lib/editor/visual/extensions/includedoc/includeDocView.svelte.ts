import type { EditorView, NodeView } from 'prosemirror-view';
import type { Node as PMNode } from 'prosemirror-model';
import { mount, unmount } from 'svelte';
import { openFile, texFiles } from '$lib/workspace/workspaceStore';
import IncludeDocDisplay from './IncludeDocDisplay.svelte';

/**
 * resolves an \input/\include argument against the current file's dir. latex appends .tex
 * when there's no extension (typst chips pass '.typ'); returns a forward-slash path (the fs
 * API takes those everywhere).
 */
export function resolveIncludePath(baseDir: string, rawPath: string, defaultExt = '.tex'): string {
	let rel = rawPath.replace(/\\/g, '/').trim();
	if (!/\.[A-Za-z0-9]+$/.test(rel)) rel += defaultExt;
	const base = (baseDir || '').replace(/\\/g, '/').replace(/\/+$/, '');
	const segs = base ? base.split('/') : [];
	for (const part of rel.split('/')) {
		if (part === '' || part === '.') continue;
		if (part === '..') {
			if (segs.length) segs.pop();
			continue;
		}
		segs.push(part);
	}
	return segs.join('/');
}

/** NodeView for includedoc (\input/\include/\subfile): a clickable chip that opens the referenced .tex file. */
export class IncludeDocView implements NodeView {
	dom: HTMLElement;
	private svelteComponent: ReturnType<typeof mount>;
	private componentProps = $state<{ node: PMNode; onOpen: () => void }>();
	node: PMNode;
	private baseDir: string;

	constructor(node: PMNode, _view: EditorView, _getPos: () => number, baseDir: string) {
		this.node = node;
		this.baseDir = baseDir ?? '';

		this.dom = document.createElement('div');
		this.dom.className = 'includedoc-node-view';

		this.componentProps = {
			node: this.node,
			onOpen: this.open.bind(this)
		};
		this.svelteComponent = mount(IncludeDocDisplay, {
			target: this.dom,
			props: this.componentProps
		});
	}

	private open() {
		const rawPath = String(this.node.attrs.path ?? '').trim();
		if (!rawPath) return;
		const resolved = resolveIncludePath(this.baseDir, rawPath, this.node.attrs.command === 'typst' ? '.typ' : '.tex');
		// prefer the workspace's canonical path (keeps the file-tree highlight in sync);
		// fall back to the resolved path so a not-yet-scanned file still opens
		function norm(p: string) {
			return p.replace(/\\/g, '/').toLowerCase();
		}
		const match = texFiles.current.find((f) => norm(f.path) === norm(resolved));
		openFile(match ? match.path : resolved);
	}

	update(node: PMNode) {
		if (node.type !== this.node.type) return false;
		this.node = node;
		if (this.componentProps) this.componentProps.node = node;
		return true;
	}

	// the chip handles clicks; keep PM from also acting on them
	stopEvent() {
		return true;
	}

	destroy() {
		if (this.svelteComponent) unmount(this.svelteComponent);
	}
}
