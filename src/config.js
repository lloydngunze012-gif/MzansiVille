// The game's public address, printed on share cards and used in share links
// (mzansiville.vercel.app, the old one, redirects here). VITE_PUBLIC_URL at build
// time overrides it.
export const PUBLIC_URL = 'softlifeza.vercel.app'

export function shareUrl() {
  const env = import.meta.env?.VITE_PUBLIC_URL
  if (env) return String(env).replace(/^https?:\/\//, '').replace(/\/$/, '')
  return PUBLIC_URL
}
