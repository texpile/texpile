import type { EditorView, NodeView } from 'prosemirror-view';
import type { Node as PMNode } from 'prosemirror-model';
import { mount, unmount } from 'svelte';
import { openFile, texFiles } from '$lib/workspace/workspaceStore';
import { samePath } from '$lib/workspace/fileSystem';
import { namesTried } from '$lib/languages/latex/knowledge/calls/fileCommands';
import { commonCommand, rolesOf } from '$lib/languages/latex/knowledge/calls/commandCalls';
import IncludeDocDisplay from './IncludeDocDisplay.svelte';

/** the paths a chip may open, best first: the names TeX tries for the command, joined to the file's directory */
export function resolveIncludePaths(baseDir: string, rawPath: string, command: string): string[] {
	const rel = rawPath.replace(/\\/g, '/').trim();
	const arg = commonCommand(command)?.args.find((a) => a.loads && rolesOf(a).includes('file'));
	const written = command === 'typst' ? [/\.[A-Za-z0-9]+$/.test(rel) ? rel : rel + '.typ'] : arg ? namesTried(arg, rel) : [rel];
	const base = (baseDir || '').replace(/\\/g, '/').replace(/\/+$/, '');
	return written.map((name) => {
		const segs = base ? base.split('/') : [];
		for (const part of name.split('/')) {
			if (part === '' || part === '.') continue;
			if (part === '..') {
				if (segs.length) segs.pop();
				continue;
			}
			segs.push(part);
		}
		return segs.join('/');
	});
}

/** NodeView for includedoc (\input/\include/\subfile): a clickable chip that opens the referenced .tex file. */
export class IncludeDocView implements NodeView {
	dom: HTMLElement;
	private svelteComponent: ReturnType<typeof mount>;
	private componentProps = $state<{ node: PMNode; onOpen: () => void }>();
	node: PMNode;
	private baseDir: () => string;

	constructor(node: PMNode, _view: EditorView, _getPos: () => number, baseDir: () => string) {
		this.node = node;
		this.baseDir = baseDir;

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
		const candidates = resolveIncludePaths(this.baseDir(), rawPath, String(this.node.attrs.command ?? 'input'));
		// prefer the workspace's canonical path (keeps the file-tree highlight in sync);
		// fall back to the resolved path so a not-yet-scanned file still opens
		const match = texFiles.current.find((f) => candidates.some((c) => samePath(f.path, c)));
		openFile(match ? match.path : candidates[0]);
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
