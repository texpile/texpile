export function rgbOf(nums: number[]) {
	if (nums.length === 1) return [nums[0], nums[0], nums[0]];
	if (nums.length === 4) return nums.slice(0, 3).map((v) => (1 - v) * (1 - nums[3]));
	return nums.slice(0, 3);
}

export function cssColor([r, g, b]: number[]) {
	return `rgb(${Math.round(r * 255)} ${Math.round(g * 255)} ${Math.round(b * 255)})`;
}

export function roundCoordinate(v: number) {
	return +v.toFixed(3);
}
