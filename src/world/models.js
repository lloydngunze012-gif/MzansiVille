// Swap a primitive for a GLB when public/models/manifest.json names one.
// The loader stays out of the first world chunk until a file is listed.

let manifestPromise = null

export function modelManifest() {
  if (!manifestPromise) {
    manifestPromise = fetch('/models/manifest.json')
      .then((res) => (res.ok ? res.json() : {}))
      .catch(() => ({}))
  }
  return manifestPromise
}

export function modelUrl(manifest, place) {
  if (!manifest) return ''
  return manifest.buildings?.[place.id] || manifest.kinds?.[place.kind] || ''
}

export async function loadGlb(url) {
  if (!url) return null
  const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js')
  const gltf = await new GLTFLoader().loadAsync(url)
  gltf.scene.traverse((node) => {
    if (node.isMesh) {
      node.castShadow = true
      node.receiveShadow = true
    }
  })
  return gltf.scene
}

// Cached Kenney kit models, re-centred on x/z with their base on the ground,
// so a placed model's position is the middle of its footprint.
const kitCache = {}
export function loadModel(url) {
  if (!kitCache[url]) {
    kitCache[url] = import('three/addons/loaders/GLTFLoader.js')
      .then(({ GLTFLoader }) => new GLTFLoader().loadAsync(url))
      .then(async (gltf) => {
        const THREE = await import('three')
        const root = new THREE.Group()
        const box = new THREE.Box3().setFromObject(gltf.scene)
        const centre = box.getCenter(new THREE.Vector3())
        gltf.scene.position.set(-centre.x, -box.min.y, -centre.z)
        gltf.scene.traverse((node) => { if (node.isMesh) { node.castShadow = true; node.receiveShadow = true } })
        root.add(gltf.scene)
        root.userData.size = box.getSize(new THREE.Vector3())
        return root
      })
    kitCache[url].catch(() => { delete kitCache[url] })
  }
  return kitCache[url]
}
