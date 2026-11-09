// Movement tests on this PC's real GPU (Edge, Direct3D 11): the software GPU of the
// default config draws about 5 fps, where movement tests are INCONCLUSIVE (tests/fps.js).
import edge from './playwright.edge.config.js'

const gpu = { launchOptions: { args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] } }
export default { ...edge, use: { ...edge.use, ...gpu }, projects: edge.projects.map((p) => ({ ...p, use: { ...p.use, ...gpu } })) }
