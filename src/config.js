// Public link printed on share cards. No deployed URL is recorded in the repo
// yet, so this is a placeholder: set VITE_PUBLIC_URL at build time (e.g. the
// Vercel production domain). On a real https deploy the card uses the page's
// own host instead, so the printed link is always one that works.
export const PUBLIC_URL_PLACEHOLDER = 'mzansiville.example'

export function shareUrl() {
  const env = import.meta.env?.VITE_PUBLIC_URL
  if (env) return String(env).replace(/^https?:\/\//, '').replace(/\/$/, '')
  try {
    if (location.protocol === 'https:' && !/^(localhost|127\.|192\.168\.)/.test(location.hostname)) return location.host
  } catch { /* not in a browser */ }
  return PUBLIC_URL_PLACEHOLDER
}
