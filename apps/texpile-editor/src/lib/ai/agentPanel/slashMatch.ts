// which of the agent's commands the text after a slash names: those that start with it first, then those that hold it
import type { AgentCommand } from './agentPanel.types';

const MOST_SHOWN = 8;

/** the command being typed: the text after a leading slash, up to the first space; null once there is a space */
export function slashQuery(text: string): string | null {
	return /^\/\S*$/.test(text) ? text.slice(1) : null;
}

/** whether a message runs one of the agent's commands, which the agent reads as one only when its text comes alone */
export function runsCommand(text: string, commands: AgentCommand[]): boolean {
	const name = /^\/(\S+)/.exec(text)?.[1];
	return !!name && commands.some((c) => c.name === name);
}

export function matchCommands(commands: AgentCommand[], query: string): AgentCommand[] {
	const q = query.toLowerCase();
	const starts = commands.filter((c) => c.name.toLowerCase().startsWith(q));
	const holds = commands.filter((c) => !c.name.toLowerCase().startsWith(q) && c.name.toLowerCase().includes(q));
	return [...starts, ...holds].slice(0, MOST_SHOWN);
}
