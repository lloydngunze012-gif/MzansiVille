// One glTF loader for the whole game, with the Draco decoder (public/draco). Job F (13 Nov): the students, the
// animation library, the city and campus buildings, the cars and the props are Draco-compressed
// (scripts/compress-people.mjs); a plain file still loads the same way.
let loaderP = null
export function gltfLoader() {
  loaderP ||= Promise.all([import('three/addons/loaders/GLTFLoader.js'), import('three/addons/loaders/DRACOLoader.js')])
    .then(([{ GLTFLoader }, { DRACOLoader }]) => new GLTFLoader().setDRACOLoader(new DRACOLoader().setDecoderPath('/draco/').setDecoderConfig({ type: 'wasm' })))
  return loaderP
}
export const loadGltf = (url) => gltfLoader().then((l) => l.loadAsync(url))
