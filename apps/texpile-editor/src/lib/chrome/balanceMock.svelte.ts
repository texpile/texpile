// mockup switch: '' today, 's' tighter right side, 'sl' plus roomier menus
const read = () => (typeof localStorage === 'undefined' ? '' : (localStorage.getItem('balanceMock') ?? ''));
class BalanceMock {
	mode = $state(read());
	constructor() {
		if (typeof window !== 'undefined') window.addEventListener('balance-mock', () => (this.mode = read()));
	}
	get tight() {
		return this.mode.includes('s');
	}
	get roomy() {
		return this.mode.includes('l');
	}
}
export const balanceMock = new BalanceMock();
