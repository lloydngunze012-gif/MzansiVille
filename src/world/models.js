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
