// the / menu over the prompt box: open while a command name is being typed, with one row picked by the arrow keys.
// Escape closes it until the text changes
import type { AgentCommand } from '../../agentPanel.types';
import { matchCommands, slashQuery } from '../../slashMatch';

export class SlashMenu {
	index = $state(0);
	/** the text the menu was closed at, so it stays closed until the reader types on */
	private dismissedAt = $state<string | null>(null);
	readonly matches = $derived.by(() => {
		const q = slashQuery(this.text());
		return q === null ? [] : matchCommands(this.commands(), q);
	});
	readonly open = $derived.by(() => this.matches.length > 0 && this.dismissedAt !== this.text());

	constructor(
		private text: () => string,
		private commands: () => AgentCommand[]
	) {}

	/** the row the arrow keys and Enter act on, kept inside the list as it narrows */
	get picked(): AgentCommand | undefined {
		return this.matches[Math.min(this.index, this.matches.length - 1)];
	}

	move(by: number): void {
		const n = this.matches.length;
		if (n) this.index = (Math.min(this.index, n - 1) + by + n) % n;
	}

	dismiss(): void {
		this.dismissedAt = this.text();
	}

	/** what the box holds once a command is taken: its name, and a space for what follows */
	completion(command: AgentCommand): string {
		this.index = 0;
		return `/${command.name} `;
	}
}
