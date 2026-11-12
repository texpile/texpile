import { describe, it, expect } from 'vitest';
import { renderMarkdown } from '$lib/ai/agentPanel/agentMarkdown';

const SAMPLE = String.raw`Angle. From notes_principal.png:

$$\tan(2\theta_{p1}) = \frac{2\tau_{xy}}{\sigma_x - \sigma_y} \quad\Rightarrow\quad \theta_{p1} = 30.9^\circ$$

Values. From notes_principal.png:

$$\sigma_{1,2} = \frac{\sigma_x + \sigma_y}{2} \pm \sqrt{\left(\frac{\sigma_x - \sigma_y}{2}\right)^2 + \tau_{xy}^2}$$
$$\boxed{\sigma_1 = +7.44\ \text{MPa}} \qquad \boxed{\sigma_2 = -20.8\ \text{MPa}}$$

Which angle goes with $\sigma_1$? The $\tan$ formula gives both angles but doesn’t say which one carries $\sigma_1$. To find out, plug $\theta_{p1}$ into`;

const count = (html: string, needle: string) => html.split(needle).length - 1;

describe('agent reply math', () => {
	it('typesets display and inline math and leaves no delimiter behind', () => {
		const html = renderMarkdown(SAMPLE);
		expect(count(html, 'agent-math-block')).toBe(3);
		expect(count(html, 'class="agent-math"')).toBe(4);
		expect(html).toContain('ML__latex');
		expect(html).not.toContain('$$');
		expect(html).toContain('notes_principal.png');
	});

	it('draws a fenced $$ and \\[ block', () => {
		const html = renderMarkdown('$$\nE = mc^2\n$$\n\n\\[\n a^2 + b^2\n\\]\n');
		expect(count(html, 'agent-math-block')).toBe(2);
	});

	it('keeps code and prose with money as text', () => {
		const html = renderMarkdown('Costs $5 and $6. Use `$x$` here.\n\n```\n$$\nx\n$$\n```\n');
		expect(html).not.toContain('ML__latex');
		expect(html).toContain('<code>$x$</code>');
		expect(html).toContain('Costs $5 and $6.');
	});

	it('keeps an unfinished formula as text while the reply streams', () => {
		for (const cut of ['$$\n\\frac{a}{b', '$$\\frac{a}', 'so $\\alpha + ', 'then \\(x']) {
			const html = renderMarkdown(cut);
			expect(html).not.toContain('ML__latex');
			expect(html).toContain('<p>');
		}
	});

	it('draws no link or attribute from TeX', () => {
		const html = renderMarkdown('$\\href{javascript:alert(1)}{x}$ $\\htmlData{a=b" onclick="x}{y}$ $\\class{c" onmouseover="x}{z}$');
		const drawn = html.replace(/ aria-label="[^"]*"/g, '');
		expect(drawn).not.toMatch(/href|javascript|onclick|onmouseover|data-|<a /);
		expect(html).toContain('ML__latex');
	});
});
