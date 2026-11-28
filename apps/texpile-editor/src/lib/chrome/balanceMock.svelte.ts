// mockup switch: '' today, '1' folder name on the left, '12' plus quiet counts
const read = () => (typeof localStorage === 'undefined' ? '' : (localStorage.getItem('balanceMock') ?? ''));
class BalanceMock {
	mode = $state(read());
	constructor() {
		if (typeof window !== 'undefined') window.addEventListener('balance-mock', () => (this.mode = read()));
	}
	get folder() {
		return this.mode.includes('1');
	}
	get quiet() {
		return this.mode.includes('2');
	}
}
export const balanceMock = new BalanceMock();
