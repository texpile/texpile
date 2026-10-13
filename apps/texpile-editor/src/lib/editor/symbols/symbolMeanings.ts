// what a letter or sign stands for in a field, as someone who knows the quantity but not the command searches for
// it: "stress" finds σ and τ. Conventions from ISO 80000 and common statistics, ML and physics use; one row per
// glyph, its LaTeX and Typst names together, so both pickers and the math search read the same table

/** LaTeX command names without the backslash, Typst names without `sym.`, and the meanings */
export type SymbolMeaningRow = readonly [latex: readonly string[], typst: readonly string[], meanings: readonly string[]];

export const SYMBOL_MEANINGS: readonly SymbolMeaningRow[] = [
	[
		['alpha'],
		['alpha'],
		[
			'angle',
			'significance level',
			'learning rate',
			'thermal diffusivity',
			'fine structure constant',
			'angular acceleration',
			'expansion coefficient',
			'absorption coefficient'
		]
	],
	[['beta'], ['beta'], ['regression coefficient', 'inverse temperature', 'type II error', 'velocity ratio', 'compressibility']],
	[
		['gamma'],
		['gamma'],
		[
			'lorentz factor',
			'heat capacity ratio',
			'adiabatic index',
			'surface tension',
			'shear strain',
			'gyromagnetic ratio',
			'discount factor',
			'euler mascheroni constant',
			'photon'
		]
	],
	[['Gamma'], ['Gamma'], ['gamma function', 'decay width', 'circulation', 'christoffel symbol', 'reflection coefficient']],
	[
		['delta'],
		['delta'],
		['small change', 'variation', 'dirac delta', 'kronecker delta', 'deflection', 'boundary layer thickness', 'phase shift']
	],
	[['Delta'], ['Delta'], ['change', 'difference', 'increment', 'laplacian', 'discriminant']],
	[
		['epsilon', 'varepsilon'],
		['epsilon', 'epsilon.alt'],
		['strain', 'permittivity', 'small quantity', 'error', 'noise', 'emissivity', 'levi civita symbol', 'tolerance']
	],
	[['zeta'], ['zeta'], ['damping ratio', 'riemann zeta function', 'vorticity']],
	[['eta'], ['eta'], ['efficiency', 'dynamic viscosity', 'viscosity', 'learning rate', 'minkowski metric']],
	[
		['theta', 'vartheta'],
		['theta', 'theta.alt'],
		['angle', 'polar angle', 'parameter', 'parameters', 'temperature', 'phase']
	],
	[['Theta'], ['Theta'], ['asymptotic tight bound', 'big theta', 'heaviside step function']],
	[
		['kappa'],
		['kappa'],
		['thermal conductivity', 'curvature', 'condition number', 'compressibility', 'dielectric constant', 'cohen kappa']
	],
	[
		['lambda'],
		['lambda'],
		[
			'wavelength',
			'eigenvalue',
			'decay constant',
			'rate parameter',
			'lagrange multiplier',
			'regularization parameter',
			'mean free path',
			'thermal conductivity'
		]
	],
	[['Lambda'], ['Lambda'], ['cosmological constant', 'eigenvalue matrix']],
	[
		['mu'],
		['mu'],
		[
			'mean',
			'expected value',
			'viscosity',
			'permeability',
			'friction coefficient',
			'reduced mass',
			'chemical potential',
			'magnetic moment',
			'micro',
			'measure'
		]
	],
	[['nu'], ['nu'], ['frequency', 'kinematic viscosity', 'poisson ratio', 'degrees of freedom', 'neutrino']],
	[['xi'], ['xi'], ['damping ratio', 'local coordinate', 'random variable', 'correlation length']],
	[['pi'], ['pi'], ['pi', 'policy', 'prime counting function', 'projection']],
	[['Pi'], ['Pi'], ['product', 'osmotic pressure', 'dimensionless group']],
	[
		['rho', 'varrho'],
		['rho', 'rho.alt'],
		['density', 'mass density', 'resistivity', 'correlation coefficient', 'charge density', 'spectral radius', 'radius']
	],
	[
		['sigma'],
		['sigma'],
		[
			'standard deviation',
			'stress',
			'normal stress',
			'conductivity',
			'surface charge density',
			'stefan boltzmann constant',
			'cross section',
			'sigmoid',
			'singular value',
			'surface tension'
		]
	],
	[['Sigma'], ['Sigma'], ['sum', 'summation', 'covariance matrix']],
	[
		['tau'],
		['tau'],
		['shear stress', 'stress', 'torque', 'time constant', 'lifetime', 'proper time', 'transmission coefficient', 'kendall tau']
	],
	[
		['phi', 'varphi'],
		['phi', 'phi.alt'],
		['angle', 'azimuthal angle', 'phase', 'golden ratio', 'electric potential', 'potential', 'euler totient', 'porosity', 'basis function']
	],
	[['Phi'], ['Phi'], ['magnetic flux', 'flux', 'cumulative distribution function', 'normal cdf']],
	[['chi'], ['chi'], ['chi squared', 'susceptibility', 'magnetic susceptibility', 'characteristic function', 'euler characteristic']],
	[['psi'], ['psi'], ['wave function', 'wavefunction', 'stream function', 'digamma function', 'potential']],
	[['Psi'], ['Psi'], ['wave function', 'wavefunction']],
	[['omega'], ['omega'], ['angular frequency', 'angular velocity', 'natural frequency', 'ordinal']],
	[['Omega'], ['Omega'], ['ohm', 'resistance', 'solid angle', 'sample space', 'asymptotic lower bound', 'big omega', 'domain']],
	[['nabla'], ['nabla'], ['divergence', 'curl', 'laplacian']],
	[['partial'], ['partial'], ['partial derivative', 'boundary']],
	[['hbar'], ['planck'], ['reduced planck constant', 'dirac constant']],
	[['ell'], ['ell'], ['length', 'loss', 'loss function', 'log likelihood']],
	[['mathbb{R}'], ['RR'], ['real numbers', 'reals']],
	[['mathbb{N}'], ['NN'], ['natural numbers']],
	[['mathbb{Z}'], ['ZZ'], ['integers']],
	[['mathbb{Q}'], ['QQ'], ['rational numbers', 'rationals']],
	[['mathbb{C}'], ['CC'], ['complex numbers']],
	[['mathbb{E}'], [], ['expectation', 'expected value']],
	[['mathbb{P}'], [], ['probability']],
	[['sim'], ['tilde.op'], ['distributed', 'distributed as']],
	[['perp'], ['perp'], ['orthogonal', 'independent']],
	[['otimes'], ['times.o'], ['kronecker product']],
	[['odot'], ['dot.o'], ['hadamard product', 'elementwise product']],
	[['oplus'], ['plus.o', 'xor'], ['xor', 'exclusive or']],
	[['dagger'], ['dagger'], ['hermitian conjugate', 'adjoint', 'conjugate transpose']],
	[['top'], ['top'], ['transpose']],
	[['mid'], ['divides'], ['given', 'conditional']],
	[['equiv'], ['equiv'], ['defined as', 'definition', 'congruent modulo']],
	[['triangleq'], ['eq.delta'], ['defined as', 'definition', 'equal by definition']],
	[['wedge'], ['and'], ['and', 'conjunction']],
	[['vee'], ['or'], ['or', 'disjunction']],
	[['hookrightarrow'], ['arrow.r.hook'], ['inclusion', 'injection', 'embedding']],
	[['twoheadrightarrow'], ['arrow.r.twohead'], ['surjection']],
	[['rightleftharpoons'], ['harpoons.rtlb'], ['equilibrium', 'reversible reaction']],
	[['ast'], ['ast.op'], ['convolution']],
	[['oint'], ['integral.cont'], ['line integral', 'circulation', 'closed integral']]
];

// "speed of light", "distributed as": the small words a meaning is said with, which no symbol is found by
const FILLER = new Set(['of', 'the', 'a', 'an', 'as', 'by', 'to']);

function wordsByName(side: 0 | 1): ReadonlyMap<string, readonly string[]> {
	const out = new Map<string, string[]>();
	for (const row of SYMBOL_MEANINGS) {
		const words = row[2].flatMap((m) => m.split(' ')).filter((w) => !FILLER.has(w));
		for (const name of row[side]) out.set(name, [...(out.get(name) ?? []), ...words]);
	}
	return out;
}

/** the meaning words of a LaTeX command name, `tau` -> shear, stress, torque ... */
export const LATEX_MEANING_WORDS = wordsByName(0);
/** the same for a Typst name, `tau`, `epsilon.alt` */
export const TYPST_MEANING_WORDS = wordsByName(1);

/** a query's words without the small ones, unless that leaves none: "to" alone still finds `\to` */
export function meaningfulTerms(terms: readonly string[]): string[] {
	const kept = terms.filter((t) => !FILLER.has(t));
	return kept.length ? kept : [...terms];
}
