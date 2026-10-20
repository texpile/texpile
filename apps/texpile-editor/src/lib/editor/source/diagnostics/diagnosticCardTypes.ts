export type DiagnosticCardFix = {
	kind: 'add' | 'move' | 'replace';
	/** the action, or the replacement text for a replace */
	label: string;
	/** the part of the label set in code */
	code?: string;
	/** the text the fix replaces, shown struck through before the replacement */
	replacing?: string;
	apply: () => void;
};

export type DiagnosticCardProps = {
	severity: 'error' | 'warning' | 'info';
	heading: string;
	message: string;
	fix?: DiagnosticCardFix;
	turnOff?: { tip: string; apply: () => void };
};
