// its own port, so a running `pnpm electron:dev` on 5173 is left alone; TEXPILE_VITE_PORT moves it for parallel runs
export const VITE_PORT = Number(process.env.TEXPILE_VITE_PORT ?? 5191);
