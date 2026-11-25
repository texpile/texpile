import type { Completion } from '@codemirror/autocomplete';

type BuiltNode = Node | { dom: Node } | null;

/** a completion's info beside the list: its text, or the node its function builds */
export function infoContent(option: Completion) {
	return (box: HTMLElement): void => {
		const about = option.info;
		if (typeof about === 'string') {
			box.replaceChildren(box.ownerDocument.createTextNode(about));
			return;
		}
		box.replaceChildren();
		if (!about) return;
		void Promise.resolve(about(option) as BuiltNode | Promise<BuiltNode>).then((built) => {
			const node = built && 'dom' in built ? built.dom : built;
			if (node instanceof Node && box.isConnected) box.replaceChildren(node);
		});
	};
}
