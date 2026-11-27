import type { Node as PMNode } from 'prosemirror-model';

export type GroupPicture = { pos: number; node: PMNode; caption: string };

export function picturesOf(group: PMNode, getPos: () => number | undefined): GroupPicture[] {
	const at = getPos();
	if (at === undefined) return [];
	const found: GroupPicture[] = [];
	group.forEach((child, offset) => {
		if (child.type.name === 'image') found.push({ pos: at + 1 + offset, node: child, caption: child.textContent });
	});
	return found;
}
