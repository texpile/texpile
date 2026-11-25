// The AI service in main (electron/src/ipc/aiServiceIpc.ts): the custom service's key, which a window sets but never
// reads, and a picture sent to the service picked in Preferences
export type ServiceKeyKept = { saved: boolean; lasting: boolean };

export type ImageAnswer = { ok: true; text: string } | { ok: false; error: string; cancelled?: true };

type AiServiceBridge = {
	serviceKey(): Promise<ServiceKeyKept>;
	setServiceKey(key: string): Promise<ServiceKeyKept>;
	imageToLatex(req: { id: string; system: string; request: string; mediaType: string; base64: string }): Promise<ImageAnswer>;
	cancel(id: string): void;
};

export function aiServiceBridge(): AiServiceBridge | undefined {
	return (globalThis as { texpileAi?: AiServiceBridge }).texpileAi;
}
