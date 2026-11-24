// Proofreading in main (electron/src/ipc/proofreadIpc.ts): the service and its keys are main's, a window only asks
export type KeyProvider = 'anthropic' | 'openai';

export type KeysKept = { anthropic: boolean; openai: boolean; lasting: boolean };

type ProofreadBridge = {
	review(system: string, request: string): Promise<{ ok: true; text: string } | { ok: false; error: string }>;
	keys(): Promise<KeysKept>;
	setKey(provider: KeyProvider, key: string): Promise<KeysKept>;
};

export function proofreadBridge(): ProofreadBridge | undefined {
	return (globalThis as { texpileProofread?: ProofreadBridge }).texpileProofread;
}
