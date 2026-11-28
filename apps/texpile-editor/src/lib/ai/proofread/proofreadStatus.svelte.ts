// The last proofread that failed, for Preferences; the editor itself stays quiet and shows Harper alone
let lastError = $state<string | null>(null);

export const proofreadStatus = {
	get lastError(): string | null {
		return lastError;
	}
};

export function noteProofreadResult(error: string | null): void {
	lastError = error;
}
