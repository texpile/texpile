// a date as Typst's `display` prints it: `[year]-[month]-[day]` unless a pattern is given, month names in English

export type TypstDate = { year: number; month: number; day: number | null; weekday: number };

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const COMPONENT = /\[\s*(\w+)((?:\s+[\w-]+:[\w-]+)*)\s*\]/g;

export function makeDate(year: number, month: number, day: number | null): TypstDate {
	return { year, month, day, weekday: (new Date(Date.UTC(year, month - 1, day ?? 1)).getUTCDay() + 6) % 7 };
}

export function readToday(): TypstDate {
	const now = new Date();
	return makeDate(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

function padNumber(value: number, modifiers: Map<string, string>, width = 2): string {
	const padding = modifiers.get('padding') ?? 'zero';
	if (padding === 'none') return String(value);
	return String(value).padStart(width, padding === 'space' ? ' ' : '0');
}

function printComponent(date: TypstDate, name: string, modifiers: Map<string, string>): string | null {
	const repr = modifiers.get('repr');
	if (name === 'year') return repr === 'last_two' ? padNumber(date.year % 100, modifiers) : String(date.year);
	if (name === 'month') {
		if (repr === 'long') return MONTHS[date.month - 1];
		if (repr === 'short') return MONTHS[date.month - 1].slice(0, 3);
		return padNumber(date.month, modifiers);
	}
	if (name === 'day') return date.day === null ? null : padNumber(date.day, modifiers);
	if (name === 'weekday') return repr === 'short' ? WEEKDAYS[date.weekday].slice(0, 3) : WEEKDAYS[date.weekday];
	return null;
}

export function displayDate(date: TypstDate, pattern?: string): string | null {
	const written = pattern ?? (date.day === null ? '[year]-[month]' : '[year]-[month]-[day]');
	let missing = false;
	const text = written.replace(COMPONENT, (_whole, name: string, given: string) => {
		const modifiers = new Map(
			given.trim()
				? given
						.trim()
						.split(/\s+/)
						.map((pair) => pair.split(':') as [string, string])
				: []
		);
		const part = printComponent(date, name, modifiers);
		if (part === null) missing = true;
		return part ?? '';
	});
	return missing ? null : text;
}
