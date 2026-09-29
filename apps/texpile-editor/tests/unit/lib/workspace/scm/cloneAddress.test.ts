import { it, expect } from 'vitest';
import { cloneAddress } from '$lib/workspace/scm/remote/cloneAddress';

it('takes a repository page, or any page inside it, as the repository', () => {
	expect(cloneAddress('https://github.com/ada/thesis')).toEqual({ url: 'https://github.com/ada/thesis.git', name: 'thesis' });
	expect(cloneAddress('https://github.com/ada/thesis/tree/main/chapters')?.url).toBe('https://github.com/ada/thesis.git');
	expect(cloneAddress('https://www.github.com/ada/thesis.git/')?.url).toBe('https://github.com/ada/thesis.git');
	expect(cloneAddress('https://github.com/ada/thesis?tab=readme-ov-file#install')?.url).toBe('https://github.com/ada/thesis.git');
	expect(cloneAddress('https://gitlab.com/uni/lab/thesis/-/blob/main/main.tex')).toEqual({
		url: 'https://gitlab.com/uni/lab/thesis.git',
		name: 'thesis'
	});
	expect(cloneAddress('https://bitbucket.org/ada/thesis/src/main/')?.url).toBe('https://bitbucket.org/ada/thesis.git');
});

it("finds the address in a README's git clone line", () => {
	expect(cloneAddress('git clone https://github.com/ada/thesis.git')?.url).toBe('https://github.com/ada/thesis.git');
	expect(cloneAddress('git clone --depth 1 git@github.com:ada/thesis.git my-copy')).toEqual({
		url: 'git@github.com:ada/thesis.git',
		name: 'thesis'
	});
});

it('keeps an address that is already one', () => {
	expect(cloneAddress('git@github.com:ada/thesis.git')).toEqual({ url: 'git@github.com:ada/thesis.git', name: 'thesis' });
	expect(cloneAddress('https://git.example.org/scm/ada/My%20Thesis.git')).toEqual({
		url: 'https://git.example.org/scm/ada/My%20Thesis.git',
		name: 'My Thesis'
	});
	expect(cloneAddress('ssh://git@host:2222/srv/thesis.git')?.name).toBe('thesis');
	expect(cloneAddress('/srv/git/thesis.git')).toEqual({ url: '/srv/git/thesis.git', name: 'thesis' });
});

it("turns an Overleaf project's page into its git address", () => {
	expect(cloneAddress('https://www.overleaf.com/project/64f0c0ffee')).toEqual({
		url: 'https://git.overleaf.com/64f0c0ffee',
		name: '64f0c0ffee'
	});
});

it('refuses what is not an address, or would run a command', () => {
	expect(cloneAddress('')).toBeNull();
	expect(cloneAddress('my thesis')).toBeNull();
	expect(cloneAddress('--upload-pack=touch /tmp/x')).toBeNull();
	expect(cloneAddress('ext::sh -c touch% /tmp/x')).toBeNull();
	expect(cloneAddress('javascript:alert(1)')).toBeNull();
	expect(cloneAddress('git clone')).toBeNull();
});
