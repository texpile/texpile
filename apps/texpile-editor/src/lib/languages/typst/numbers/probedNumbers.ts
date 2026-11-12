// tinymist's answer to the numbers probe, read into the numbers the visual editor shows
import type { TypstPrintedNumber } from '$lib/stores/typstPrintedNumbers';

type ProbedItem = {
	kind?: unknown;
	number?: unknown;
	label?: unknown;
	text?: unknown;
	level?: unknown;
	figureKind?: unknown;
	supplement?: unknown;
	page?: unknown;
	repeats?: unknown;
};

/** what the request needs of the server, so the retry can be run against a stand-in */
export type NumbersProbeServer = {
	/** the probe's text, as the newest version the server has of it */
	show(text: string): void;
	/** the probe's exportQuery; rejects with the server's error */
	query(): Promise<unknown>;
};

const KINDS = new Set(['heading', 'equation', 'figure', 'footnote']);
const MISSED_RETRIES = 8;

function stringOrNull(value: unknown): string | null {
	return typeof value === 'string' ? value : null;
}

/** a footnote that repeats an earlier one is left out: the editor draws it with that footnote's number already */
export function printedNumbersFrom(items: readonly ProbedItem[]): TypstPrintedNumber[] {
	const out: TypstPrintedNumber[] = [];
	for (const item of items) {
		if (typeof item.kind !== 'string' || !KINDS.has(item.kind) || typeof item.repeats === 'string') continue;
		out.push({
			kind: item.kind as TypstPrintedNumber['kind'],
			number: stringOrNull(item.number),
			label: stringOrNull(item.label),
			text: typeof item.text === 'string' ? item.text : '',
			...(typeof item.level === 'number' ? { level: item.level } : {}),
			...(typeof item.figureKind === 'string' ? { figureKind: item.figureKind } : {}),
			...(typeof item.supplement === 'string' && item.supplement ? { supplement: item.supplement } : {}),
			page: typeof item.page === 'number' ? item.page : 0
		});
	}
	return out;
}

function probedItemsOf(reply: unknown): ProbedItem[] | null {
	// eslint-disable-next-line id-denylist -- `data` is the reply's wire field name
	const encoded = (reply as { data?: unknown } | null)?.data;
	if (typeof encoded !== 'string') return null;
	const bytes = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
	const items: unknown = JSON.parse(new TextDecoder().decode(bytes));
	return Array.isArray(items) ? (items as ProbedItem[]) : null;
}

// tinymist built the probe's project while the pinned main was compiling and never saw the probe
function probeWasMissed(error: unknown): boolean {
	const message = (error as { message?: unknown } | null)?.message;
	return /file not found \(searched at [^)]*__texpile_numbers\.typ/.test(typeof message === 'string' ? message : String(error));
}

/** the document's printed numbers, or null when it does not compile */
export async function probedNumbers(server: NumbersProbeServer, text: string, pauseMs = 20): Promise<TypstPrintedNumber[] | null> {
	server.show(text);
	for (let attempt = 0; ; attempt++) {
		try {
			const items = probedItemsOf(await server.query());
			return items && printedNumbersFrom(items);
		} catch (error) {
			if (!probeWasMissed(error) || attempt >= MISSED_RETRIES) return null;
			// asking again reads the same failed compile; only a new version of the probe compiles again
			server.show(text + '\n'.repeat(attempt + 1));
			await new Promise((resolve) => setTimeout(resolve, pauseMs));
		}
	}
}
