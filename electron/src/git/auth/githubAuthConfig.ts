// Texpile's GitHub OAuth app, for signing in to GitHub in the browser (githubAuth.ts). VS Code's
// github-authentication extension keeps its client ID the same way, in code: an OAuth app's client
// ID is public, and the device flow needs no client secret at all. Never add one here.
//
// The app is registered on GitHub (Settings, Developer settings, OAuth Apps) with Device Flow
// enabled. TEXPILE_GITHUB_CLIENT_ID overrides it, for a fork with an app of its own or a test.
export const GITHUB_CLIENT_ID: string = process.env.TEXPILE_GITHUB_CLIENT_ID || 'Ov23liQ4lw3n0dSMrjJf';
