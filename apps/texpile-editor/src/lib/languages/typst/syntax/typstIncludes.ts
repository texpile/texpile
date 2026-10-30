import type { Tree } from '@lezer/common';
import { stringValue } from './typstCalls';

export type TypstInclude = { pos: number; target: string };

export function includedFiles(tree: Tree, src: string): TypstInclude[] {
	const out: TypstInclude[] = [];
	tree.iterate({
		enter: (n) => {
			if (n.name !== 'ModuleInclude') return;
			const path = n.node.getChild('Str');
			if (path) out.push({ pos: n.from, target: stringValue(path, src) });
			return false;
		}
	});
	return out;
}
