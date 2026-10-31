// Test speed-up: ?fast=1 runs animations, walks and timers 10x faster (e2e tests
// and audits). Frame loops multiply their dt by SPEED; timeouts use ms().
export const SPEED = typeof location !== 'undefined' && new URLSearchParams(location.search).get('fast') === '1' ? 10 : 1
export const ms = (n) => n / SPEED
