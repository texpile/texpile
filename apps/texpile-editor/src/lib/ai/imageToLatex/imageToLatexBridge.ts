// A picture sent to the agent picked in Preferences (electron/src/ipc/imageToLatexIpc.ts)
export type ImageAnswer = { ok: true; text: string } | { ok: false; error: string; cancelled?: true };

type ImageToLatexBridge = {
	/** strong: a drawing, for the strong model */
	imageToLatex(req: {
		id: string;
		system: string;
		request: string;
		mediaType: string;
		base64: string;
		strong: boolean;
	}): Promise<ImageAnswer>;
	cancel(id: string): void;
};

export function imageToLatexBridge(): ImageToLatexBridge | undefined {
	return (globalThis as { texpileAi?: ImageToLatexBridge }).texpileAi;
}
