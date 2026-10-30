import base from '../../playwright.config.js'
export default { ...base, testDir: '../../tests', use: { ...(base.use || {}), channel: 'msedge' } }
