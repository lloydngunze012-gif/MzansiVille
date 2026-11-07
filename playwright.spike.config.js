import edge from './playwright.edge.config.js'

// Spikes that measure frame rate (owner, 7 Nov): this PC's real GPU, Edge, with the 60 fps frame cap
// off, so a heavier set of characters shows up as fewer fps instead of hiding under the vsync cap.
export default { ...edge, use: { ...edge.use, launchOptions: { args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--disable-frame-rate-limit', '--disable-gpu-vsync'] } } }
