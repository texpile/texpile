// The custom service under AI Assistant › Advanced: any address that speaks OpenAI's chat completions, such as a model
// in Ollama or LM Studio, a university gateway, OpenRouter, or OpenAI and Anthropic themselves
import { net } from 'electron';
import type { AgentPrompt, AgentResult } from '../runAgent';

export type CustomService = { url: string; key: string | null; model: string };

type ChatContent = string | ({ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } })[];

function userContent(prompt: AgentPrompt): ChatContent {
	if (!prompt.images?.length) return prompt.request;
	return [
		{ type: 'text', text: prompt.request },
		...prompt.images.map((i) => ({ type: 'image_url' as const, image_url: { url: `data:${i.mediaType};base64,${i.base64}` } }))
	];
}

function record(v: unknown): Record<string, unknown> {
	return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
}

/** the service's own words on a refusal, which name a wrong key or model far better than the status alone */
async function refusalOf(res: Response): Promise<string> {
	const body = await res.text().catch(() => '');
	let said: string;
	try {
		const error = record(JSON.parse(body)).error;
		said = typeof error === 'string' ? error : String(record(error).message ?? '');
	} catch {
		said = body.slice(0, 300);
	}
	return `${res.status} ${res.statusText}${said ? `: ${said}` : ''}`;
}

export async function askService(service: CustomService, prompt: AgentPrompt, signal: AbortSignal): Promise<AgentResult> {
	const base = service.url.trim().replace(/\/+$/, '');
	if (!base) return { ok: false, error: 'No service address is set.' };
	if (!service.model.trim()) return { ok: false, error: 'No model is set.' };
	const messages = [...(prompt.system ? [{ role: 'system', content: prompt.system }] : []), { role: 'user', content: userContent(prompt) }];
	try {
		// net.fetch, so the system proxy applies as it does for the rest of Texpile
		const res = await net.fetch(`${base}/chat/completions`, {
			method: 'POST',
			headers: { 'content-type': 'application/json', ...(service.key ? { authorization: `Bearer ${service.key}` } : {}) },
			body: JSON.stringify({ model: service.model.trim(), messages }),
			signal
		});
		if (!res.ok) return { ok: false, error: await refusalOf(res) };
		const choice = record((record(await res.json()).choices as unknown[] | undefined)?.[0]);
		const text = record(choice.message).content;
		return typeof text === 'string' && text.trim() ? { ok: true, text } : { ok: false, error: 'The service gave no answer.' };
	} catch (e) {
		if (signal.aborted && (signal.reason as Error | undefined)?.name !== 'TimeoutError')
			return { ok: false, error: 'cancelled', cancelled: true };
		if (signal.aborted) return { ok: false, error: 'The service did not answer in time.' };
		return { ok: false, error: e instanceof Error ? e.message : String(e) };
	}
}
