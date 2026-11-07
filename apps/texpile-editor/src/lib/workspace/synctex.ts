// source <-> PDF sync via the synctex binary over Electron IPC; needs a -synctex=1 compile
import { nativeBridge } from './fileSystem';

/** one box SyncTeX records for a line, in PDF points from the page's top left: bl and bv are its left and baseline */
export type SyncBox = { page: number; x: number; y: number; W: number; H: number; bl?: number; bv?: number };

// flat shapes (not discriminated unions) so callers can read fields without narrowing;
// on failure ok is false and the position fields are absent
export type ForwardResult = {
	ok: boolean;
	error?: string;
	page: number;
	x: number;
	y: number;
	h: number;
	v: number;
	width: number;
	height: number;
	boxes?: SyncBox[];
};

export type InverseResult = {
	ok: boolean;
	error?: string;
	input: string;
	line: number;
	column: number;
};

async function call<T>(body: Record<string, unknown>): Promise<T> {
	const n = nativeBridge();
	if (!n) return { ok: false, error: 'SyncTeX requires the Texpile desktop app.' } as T;
	try {
		return (await n.synctex(body)) as T;
	} catch (e) {
		return { ok: false, error: e instanceof Error ? e.message : String(e) } as T;
	}
}

/** forward sync: a source position (absolute .tex path + 1-based line) -> a PDF location. */
export function synctexForward(pdf: string, tex: string, line: number, column = 0): Promise<ForwardResult> {
	return call<ForwardResult>({ action: 'view', pdf, tex, line, column });
}

/** inverse sync: a PDF location (1-based page + x,y in PDF points) -> the source file + 1-based line. */
export function synctexInverse(pdf: string, page: number, x: number, y: number): Promise<InverseResult> {
	return call<InverseResult>({ action: 'edit', pdf, page, x, y });
}
