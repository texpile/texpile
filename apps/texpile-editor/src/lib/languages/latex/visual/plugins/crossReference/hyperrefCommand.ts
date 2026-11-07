// \hyperref[label]{text} as its settings, the label it links to and the text it shows; both change in place
import { balancedBraces } from '$lib/languages/latex/visual/core';
export type HyperrefCommand = { label: string; text: string };

const HYPERREF = /^(\s*\\hyperref\s*\[)([^\]{}]*)(\]\s*\{)([\s\S]*)(\}\s*)$/;

export function readHyperref(source: string): HyperrefCommand | null {
	const match = HYPERREF.exec(source);
	return match && balancedBraces(match[4]) ? { label: match[2], text: match[4] } : null;
}

export function writeHyperref(source: string, next: HyperrefCommand): string {
	return source.replace(
		HYPERREF,
		(_, open: string, _label: string, middle: string, _text: string, close: string) => open + next.label + middle + next.text + close
	);
}
