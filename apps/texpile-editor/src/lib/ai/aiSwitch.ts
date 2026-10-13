// the switch in Preferences › AI, also offered where the Agent tab first asks for an agent
import { settings, setMcpEnabled, updateSettings } from '$lib/settings';

/** the MCP server stops with the rest; turning AI back on leaves it for the reader to start again */
export async function setAiOff(off: boolean): Promise<void> {
	updateSettings({ aiOff: off });
	if (off && settings.current.mcpEnabled) await setMcpEnabled(false);
}
