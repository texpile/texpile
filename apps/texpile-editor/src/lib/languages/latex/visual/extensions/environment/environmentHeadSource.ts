import type { Node } from 'prosemirror-model';

export function environmentHeadSource(node: Node): string {
	return `\\begin{${String(node.attrs.name ?? '')}}${String(node.attrs.args ?? '')}`;
}

// every [..] and {..} group closed, one after another
function argumentsComplete(text: string): boolean {
	let i = 0;
	while (i < text.length) {
		const close = text[i] === '[' ? ']' : text[i] === '{' ? '}' : null;
		if (!close) return false;
		let braces = 0;
		for (i++; i < text.length; i++) {
			if (text[i] === '\\') i++;
			else if (text[i] === '{') braces++;
			else if (text[i] === close && braces === 0) break;
			else if (text[i] === '}') {
				if (braces === 0) return false;
				braces--;
			}
		}
		if (i >= text.length) return false;
		i++;
		while (/\s/.test(text[i] ?? '')) i++;
	}
	return true;
}

/** the name and arguments a typed head stands for; null while it is not one yet */
export function readEnvironmentHead(text: string): { name: string; args: string } | null {
	const head = /^\s*\\begin\{([^{}\\\s]+)\}([\s\S]*)$/.exec(text);
	if (!head) return null;
	const args = head[2].trim();
	return argumentsComplete(args) ? { name: head[1], args } : null;
}
