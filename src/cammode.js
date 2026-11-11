// The view for this visit (Sims view first, owner 11 Nov). Every visit starts in Sims: the choice
// (Top, Sims, Eye, or the 2D Map) is kept in memory only, so it holds across campus, the Caf, home
// and SunnyBay within one visit and is gone on a reload. No imports: the UI reads it without
// pulling in the 3D code.
const MODES = ['top', 'sims', 'eye']
const Q = new URLSearchParams(location.search)
let cam = 'sims'
let view = Q.get('view') === 'map' ? 'map' : '3d' // (?view=map: tests that want the 2D map from the start)

// (the old remembered choices: dropped, so nothing reads a stale one)
try { localStorage.removeItem('mzansiville.camera'); localStorage.removeItem('mzansiville.view') } catch { /* private mode */ }

export function getCam() { return cam }
export function setCam(mode) { if (MODES.includes(mode)) cam = mode }
export function getView() { return view }
export function setView(v) { view = v === 'map' ? 'map' : '3d' }
