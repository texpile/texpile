// The MCP server as main has it: running, on which port, or why not
type McpStatus = { running: boolean; port: number | null; error: string | null };

function nativeMcp(): { mcpStatus?: () => Promise<McpStatus> } | undefined {
	return (window as unknown as { texpileNative?: { mcpStatus?: () => Promise<McpStatus> } }).texpileNative;
}

class McpStatusStore {
	current = $state<McpStatus | null>(null);

	async refresh(): Promise<void> {
		this.current = (await nativeMcp()?.mcpStatus?.()) ?? null;
	}
}

export const mcpStatus = new McpStatusStore();
