// What the agent panel needs of the open workspace. A module rather than props, as Local History's
// actions: the panel sits four components below the workspace that provides them
export type AgentHost = {
	/** a file against an earlier text of it, in its own tab */
	openCompareTab(path: string, compare: { hash: string; subject: string }): void;
	openFile(path: string): void;
	writeText(path: string, content: string): Promise<void>;
	/** the agent reads the files from disk, so what is typed goes there before a turn starts */
	flushPendingSave(): Promise<void>;
	/** the reader's selection as a span of the open file's text, given whole; null with none */
	selection(): { text: string; from: number; to: number } | null;
};

let current = $state<AgentHost | null>(null);

export const agentHost = {
	get current(): AgentHost | null {
		return current;
	}
};

/** the workspace provides it while it is open; the returned function lets go */
export function provideAgentHost(host: AgentHost): () => void {
	current = host;
	return () => {
		if (current === host) current = null;
	};
}
