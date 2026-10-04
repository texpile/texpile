// a name field in Version History, its text selected as it appears so typing replaces it
export function focusOnMount(node: HTMLInputElement) {
	const t = setTimeout(() => node.select(), 0);
	return { destroy: () => clearTimeout(t) };
}
