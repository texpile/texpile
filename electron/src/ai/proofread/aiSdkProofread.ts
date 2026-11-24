// A proofread through the AI SDK: Anthropic with the writer's own key, or any service that speaks OpenAI's chat
// completions (OpenAI, OpenRouter, Gemini, Groq, DeepSeek, Mistral, or Ollama and LM Studio on this computer)
import { generateText, jsonSchema, Output, type LanguageModel } from 'ai';
import { createAnthropic, type AnthropicLanguageModelOptions } from '@ai-sdk/anthropic';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { net } from 'electron';
import { PROOFREAD_TIMEOUT_MS, type ProofreadAnswer, type ProofreadPrompt } from './proofreadAnswer';
import { PROOFREAD_SCHEMA } from './proofreadSchema';

export const DEFAULT_ANTHROPIC_MODEL = 'claude-haiku-5-5';

// net.fetch, so the system proxy applies as it does for the rest of Texpile
const fetch = net.fetch as typeof globalThis.fetch;

const OUTPUT = Output.object({ schema: jsonSchema<unknown>(PROOFREAD_SCHEMA) });

async function proofreadWith(
	model: LanguageModel,
	prompt: ProofreadPrompt,
	providerOptions?: Parameters<typeof generateText>[0]['providerOptions']
): Promise<ProofreadAnswer> {
	try {
		const result = await generateText({
			model,
			system: prompt.system,
			prompt: prompt.request,
			output: OUTPUT,
			maxRetries: 1,
			abortSignal: AbortSignal.timeout(PROOFREAD_TIMEOUT_MS),
			providerOptions
		});
		return { ok: true, text: JSON.stringify(result.output) };
	} catch (e) {
		return { ok: false, error: e instanceof Error ? e.message : String(e) };
	}
}

export function anthropicProofread(key: string, model: string, prompt: ProofreadPrompt): Promise<ProofreadAnswer> {
	const anthropic = createAnthropic({ apiKey: key, fetch });
	// a quick judgment on short text: thinking would only add seconds and cost
	return proofreadWith(anthropic(model || DEFAULT_ANTHROPIC_MODEL), prompt, {
		anthropic: { thinking: { type: 'disabled' }, effort: 'low' } satisfies AnthropicLanguageModelOptions
	});
}

export function openAiProofread(baseUrl: string, key: string | null, model: string, prompt: ProofreadPrompt): Promise<ProofreadAnswer> {
	if (!baseUrl.trim()) return Promise.resolve({ ok: false, error: 'No base URL is set.' });
	if (!model.trim()) return Promise.resolve({ ok: false, error: 'No model is set.' });
	const service = createOpenAICompatible({
		name: 'proofread',
		baseURL: baseUrl.trim().replace(/\/+$/, ''),
		apiKey: key ?? undefined,
		fetch
	});
	return proofreadWith(service.chatModel(model.trim()), prompt);
}
