// Proofreading in main (electron/src/ipc/proofreadIpc.ts): the service is main's, a window only asks
type ProofreadBridge = {
	review(system: string, request: string): Promise<{ ok: true; text: string } | { ok: false; error: string }>;
};

export function proofreadBridge(): ProofreadBridge | undefined {
	return (globalThis as { texpileProofread?: ProofreadBridge }).texpileProofread;
}
