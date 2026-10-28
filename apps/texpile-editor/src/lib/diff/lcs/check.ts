export function check(condition: boolean, message = 'check failed'): asserts condition {
	if (!condition) throw new Error(message);
}
