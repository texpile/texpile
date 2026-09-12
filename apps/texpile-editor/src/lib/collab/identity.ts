// how you appear to the other people in a session: the name over your cursor, and its color
import { userData } from '$lib/storage/userData';
import { GUEST_COLORS, guestColor } from './guestColors';

export const HOST_COLOR = '#2563eb';

export const PRESENCE_COLORS = [HOST_COLOR, ...GUEST_COLORS];

export type PresenceRole = 'host' | 'guest';

export function presenceIdentity(role: PresenceRole, clientId = 0, name = userData.current.collabName): { name: string; color: string } {
	const color = userData.current.collabColor;
	return {
		name: name.trim() || (role === 'host' ? 'Host' : 'Guest'),
		color: color || (role === 'host' ? HOST_COLOR : guestColor(clientId))
	};
}
