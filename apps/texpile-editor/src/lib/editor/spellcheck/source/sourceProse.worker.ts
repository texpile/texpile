// masking reads the whole file: a 1.9 MB paper held the main thread for most of a second
import type { SpellLanguage } from '../languages/spellLanguages';
import { ownMathTreeOf } from './ownMathTree';
import { sourceProse, type SpellMarkup } from './sourceProse';

type Ask = { id: number; text: string; markup: SpellMarkup; spelling: SpellLanguage | null };

self.onmessage = (event: MessageEvent<Ask>) => {
	const { id, text, markup, spelling } = event.data;
	function post(m: unknown): void {
		(self as unknown as { postMessage: (m: unknown) => void }).postMessage(m);
	}
	try {
		post({ id, prose: sourceProse(text, markup, spelling, markup === 'plaintext' ? ownMathTreeOf(text) : undefined) });
	} catch (err) {
		post({ id, error: err instanceof Error ? err.message : String(err) });
	}
};
