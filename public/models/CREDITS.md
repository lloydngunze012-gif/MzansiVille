# Models

Drop CC0 glTF files here and name them in `manifest.json`. Until a file is listed, CampusVille draws stylised boxes.

Intended kits, both CC0:

- [Kenney City Kit](https://kenney.nl/assets/city-kit-suburban), [Furniture Kit](https://kenney.nl/assets/furniture-kit), and [Nature Kit](https://kenney.nl/assets/nature-kit) — CC0
- [Quaternius animated characters](https://quaternius.com/) — CC0

## In use

| Files | Pack | Author | Source | Licence |
| --- | --- | --- | --- | --- |
| `people/superhero_female.glb`, `people/superhero_male.glb`, `people/hair_*.glb`, `people/eyebrows_*.glb` | Universal Base Characters (Standard) | Quaternius | https://quaternius.itch.io/universal-base-characters | CC0 (`people/License-universal-base-characters.txt`) |
| `people/animations.glb` | Universal Animation Library (Standard), 13 of the clips | Quaternius | https://quaternius.itch.io/universal-animation-library | CC0 (`people/License-universal-animation-library.txt`) |
| `props/tree_*.glb`, `props/plant_*.glb`, `props/flower_*.glb`, `props/grass_large.glb` | Nature Kit | Kenney | https://kenney.nl/assets/nature-kit | CC0 (`props/License-nature-kit.txt`) |
| `props/bench.glb`, `props/table*.glb`, `props/chair.glb`, `props/stoolBar.glb`, `props/kitchen*.glb`, `props/trashcan.glb`, `props/speaker.glb`, `props/pottedPlant.glb`, `props/radio.glb` | Furniture Kit | Kenney | https://kenney.nl/assets/furniture-kit | CC0 (`props/License-furniture-kit.txt`) |
| `city/*.glb`, `city/Textures/colormap.png` | City Kit (Commercial) 2.1 | Kenney | https://kenney.nl/assets/city-kit-commercial | CC0 (`city/License.txt`) |
| `suburb/*.glb`, `suburb/Textures/colormap.png` | City Kit (Suburban) 2.0 | Kenney | https://kenney.nl/assets/city-kit-suburban | CC0 (`suburb/License.txt`) |
| `cars/*.glb`, `cars/Textures/colormap.png` | Car Kit | Kenney | https://kenney.nl/assets/car-kit | CC0 (`cars/License.txt`) |

`src/world/avatar3d.js` loads the Quaternius people for the player and everyone on campus: textures are removed and meshes simplified for phones, skin and clothes are vertex colours by body region, hair hangs on the head bone, and the clips are mapped to idle, walk, jog, sit, talk, dance, interact and pick up. It swaps the palette texture for vertex colours, so the character creator sets skin, hair, top, trousers and shoes. Clips used: `idle`, `walk`, `sit`, `static`, `interact-right`, `interact-left`, `emote-yes`, `emote-no`, `pick-up`.

`src/world/dress.js` places the props for the Quad and the cafeteria (layout and story in `data/campusville/place_story.json`) and re-centres each one, since Kenney furniture has its origin at a corner.

`manifest.json` maps a place id or a place kind to a URL under `/models/`. The character field is reserved for the rigged student in a later pass.

```json
{
  "buildings": { "library": "/models/library.glb" },
  "kinds": { "lecture": "/models/lecture.glb" },
  "character": ""
}
```

`src/world/buildings.js` fits City Kit buildings to each place's footprint, tints them and adds a facade sign; `src/world/surroundings.js` places the town edge, parked cars and the taxi rank.
