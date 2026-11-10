declare module 'pdfjs-dist/legacy/build/pdf.sandbox.mjs' {
	/** `wasmUrl` is the folder holding quickjs-eval.js, ending in a slash */
	// eslint-disable-next-line @typescript-eslint/naming-convention -- pdf.js's export name
	export function QuickJSSandbox(wasmUrl?: string): Promise<unknown>;
}
