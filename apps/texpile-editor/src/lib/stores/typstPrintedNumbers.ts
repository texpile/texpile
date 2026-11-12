// the numbers Typst printed at the last compile of a document, for the visual editor to show on its elements
import { fileIdentityKey } from '$lib/files/identity/fileUris';

export type TypstPrintedNumber = {
	kind: 'heading' | 'equation' | 'figure' | 'footnote';
	/** as printed: '1.a', '(3)', '2', '*'; null when the element prints none */
	number: string | null;
	/** the element's label name, without the angle brackets; null when it has none */
	label: string | null;
	/** a heading's title or a figure's caption as plain text; '' for the rest */
	text: string;
	/** headings only */
	level?: number;
	/** figures only: 'image', 'table', 'raw' or a custom kind's name */
	figureKind?: string;
	/** figures only: the word printed before the number, 'Figure', 'Table', 'Listing' or the document's own */
	supplement?: string;
	page: number;
};

export type PrintedNumbersOfFile = { main: string; items: readonly TypstPrintedNumber[] };

type CompiledDocument = { main: string; files: Set<string>; items: readonly TypstPrintedNumber[] };

const documents = new Map<string, CompiledDocument>();
const listeners = new Set<() => void>();
const firstShownListeners = new Set<() => void>();

/** `items` is every heading, block equation, figure and footnote of the document in the order Typst laid them out; `files` the files it is made of */
export function setTypstPrintedNumbers(mainPath: string, files: readonly string[], items: readonly TypstPrintedNumber[]): void {
	const key = fileIdentityKey(mainPath);
	documents.set(key, { main: mainPath, files: new Set([key, ...files.map(fileIdentityKey)]), items });
	listeners.forEach((fn) => fn());
}

/** the document's numbers stop showing: its main file changed, the folder closed, or its compile left no numbers */
export function forgetTypstPrintedNumbers(mainPath: string): void {
	if (documents.delete(fileIdentityKey(mainPath))) listeners.forEach((fn) => fn());
}

/** what the last compile printed for the document `path` is part of, or null before any compile */
export function printedNumbersOfFile(path: string | null): PrintedNumbersOfFile | null {
	if (!path) return null;
	const key = fileIdentityKey(path);
	for (const doc of documents.values()) if (doc.files.has(key)) return { main: doc.main, items: doc.items };
	return null;
}

/** calls `fn` whenever a document's numbers are set or forgotten; returns the unsubscribe. The caller is an editor showing them */
export function onTypstPrintedNumbers(fn: () => void): () => void {
	listeners.add(fn);
	if (listeners.size === 1) firstShownListeners.forEach((shown) => shown());
	return () => void listeners.delete(fn);
}

/** an editor is showing the numbers, so reading them is worth a compile */
export function typstPrintedNumbersShown(): boolean {
	return listeners.size > 0;
}

/** calls `fn` when the first editor starts showing the numbers; returns the unsubscribe */
export function onTypstPrintedNumbersShown(fn: () => void): () => void {
	firstShownListeners.add(fn);
	return () => void firstShownListeners.delete(fn);
}
