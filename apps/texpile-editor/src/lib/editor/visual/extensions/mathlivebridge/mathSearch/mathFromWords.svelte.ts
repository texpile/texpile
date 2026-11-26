// From your words: a phrase typed in the math search, turned into math by the agent picked in Preferences
import { agentBridge } from '$lib/ai/agent/agentBridge';
import { agentOffered } from '$lib/ai/agent/aiAgent.svelte';
import type { MathSyntax } from '../mathFieldFactory';

export type WordsAnswer = { state: 'asking' } | { state: 'done'; math: string } | { state: 'failed'; error: string };

const PAUSE_MS = 600;
const FEWEST_WORDS = 2;

const SYSTEM: Record<MathSyntax, string> = {
	latex:
		'Turn the description into LaTeX math for an equation. Answer with the math only, with no $ signs, no \\[ \\], no code fence and no explanation. Write every symbol as a LaTeX command, never as a Unicode character. Use amsmath commands. Do not think.',
	typst:
		'Turn the description into Typst math for an equation. Answer with the math only, with no $ signs, no code fence and no explanation. Do not think.'
};

/** a phrase of two words or more; one word is a name the search finds */
export function isPhrase(query: string): boolean {
	return query.trim().split(/\s+/).length >= FEWEST_WORDS;
}

export function wordsOffered(): boolean {
	return agentOffered() !== null && !!agentBridge();
}

/** the agent's answer without the wrapping a model adds anyway */
export function mathOfAnswer(text: string): string {
	return text
		.trim()
		.replace(/^```[a-z]*\s*|\s*```$/g, '')
		.replace(/^\$\$?|\$\$?$/g, '')
		.replace(/^\\\[|\\\]$/g, '')
		.trim();
}

class MathFromWords {
	answers = $state<Record<string, WordsAnswer>>({});
	private timer: ReturnType<typeof setTimeout> | null = null;
	private pending = new Map<string, Promise<WordsAnswer>>();

	answerFor(syntax: MathSyntax, query: string): WordsAnswer | null {
		return this.answers[keyOf(syntax, query)] ?? null;
	}

	/** asks once typing pauses; `now` asks at once */
	askSoon(syntax: MathSyntax, query: string, now = false): void {
		if (this.timer) clearTimeout(this.timer);
		this.timer = null;
		if (!isPhrase(query) || !wordsOffered()) return;
		const known = this.answerFor(syntax, query);
		if (known && known.state !== 'failed') return;
		if (now) void this.ask(syntax, query);
		else this.timer = setTimeout(() => void this.ask(syntax, query), PAUSE_MS);
	}

	/** the answer, once it comes */
	ask(syntax: MathSyntax, query: string): Promise<WordsAnswer> {
		const key = keyOf(syntax, query);
		const known = this.answers[key];
		if (known?.state === 'done') return Promise.resolve(known);
		const pending = this.pending.get(key);
		if (pending) return pending;
		const bridge = agentBridge();
		if (!bridge) return Promise.resolve({ state: 'failed', error: '' });
		this.answers[key] = { state: 'asking' };
		// never cancelled: a cancel ends the agent's warm process, and the next phrase would wait for a new one
		const answering = bridge.run(crypto.randomUUID(), query.trim(), SYSTEM[syntax], 'math').then((reply): WordsAnswer => {
			const math = reply.ok ? mathOfAnswer(reply.text) : '';
			const answer: WordsAnswer = math ? { state: 'done', math } : { state: 'failed', error: reply.ok ? '' : reply.error };
			this.answers[key] = answer;
			this.pending.delete(key);
			return answer;
		});
		this.pending.set(key, answering);
		return answering;
	}

	/** the agent's process starts as the search opens, so the first phrase does not wait for it */
	warm(syntax: MathSyntax): void {
		if (wordsOffered()) agentBridge()?.warmMath(SYSTEM[syntax]);
	}

	stop(): void {
		if (this.timer) clearTimeout(this.timer);
		this.timer = null;
	}
}

function keyOf(syntax: MathSyntax, query: string): string {
	return `${syntax}\0${query.trim()}`;
}

export const mathFromWords = new MathFromWords();
