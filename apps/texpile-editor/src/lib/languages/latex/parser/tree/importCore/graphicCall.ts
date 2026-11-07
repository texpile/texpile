// an \includegraphics call as an image node
import type { PmNode } from '../../builders';
import { argText, mandatoryArgs, optionalArg } from '../walk/treeArgs';
import { argTextContent } from '../walk/argContent';
import type { TreeImport } from './treeImport';
import type { ImportCall } from '../convert/treeCalls';

export function imageOf(im: TreeImport, call: ImportCall): PmNode[] | null {
	const braced = mandatoryArgs(call);
	if (!braced.length) return null;
	const src = argTextContent(im, braced[braced.length - 1]);
	const opt = optionalArg(call);
	return [
		im.core.node('image', { src, alt: null, title: null, label: null, options: opt ? argText(im.src, opt) : '', bareOriginal: true })
	];
}
