// a stable presence color per client id, from a small distinguishable palette
export const GUEST_COLORS = ['#e11d48', '#d97706', '#059669', '#7c3aed', '#0891b2', '#c026d3', '#65a30d', '#ea580c'];
export function guestColor(clientId: number): string {
	return GUEST_COLORS[clientId % GUEST_COLORS.length];
}
