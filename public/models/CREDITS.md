# Models

Drop CC0 glTF files here and name them in `manifest.json`. Until a file is listed, CampusVille draws stylised boxes.

Intended kits, both CC0:

- [Kenney City Kit](https://kenney.nl/assets/city-kit-suburban), [Furniture Kit](https://kenney.nl/assets/furniture-kit), and [Nature Kit](https://kenney.nl/assets/nature-kit) — CC0
- [Quaternius animated characters](https://quaternius.com/) — CC0

## In use

| Files | Pack | Author | Source | Licence |
| --- | --- | --- | --- | --- |
| `people2/male_*.glb` | Ultimate Modular Men (Feb 2022): Casual Hoodie, Casual 2, Suit, Punk, Beach outfits and heads | Quaternius | https://quaternius.com/packs/ultimatemodularcharacters.html | CC0 (`people2/License-ultimate-modular-men.txt`) |
| `people2/female_*.glb` | Ultimate Modular Women (Apr 2022): Casual, Formal, Suit, Punk, Adventurer outfits and heads | Quaternius | https://quaternius.com/packs/ultimatemodularwomen.html | CC0 (`people2/License-ultimate-modular-women.txt`) |
| `props/tree_*.glb`, `props/plant_*.glb`, `props/flower_*.glb`, `props/grass_large.glb` | Nature Kit | Kenney | https://kenney.nl/assets/nature-kit | CC0 (`props/License-nature-kit.txt`) |
| `props/bench.glb`, `props/table*.glb`, `props/chair.glb`, `props/stoolBar.glb`, `props/kitchen*.glb`, `props/trashcan.glb`, `props/speaker.glb`, `props/pottedPlant.glb`, `props/radio.glb` | Furniture Kit | Kenney | https://kenney.nl/assets/furniture-kit | CC0 (`props/License-furniture-kit.txt`) |
| `city/*.glb`, `city/Textures/colormap.png` | City Kit (Commercial) 2.1 | Kenney | https://kenney.nl/assets/city-kit-commercial | CC0 (`city/License.txt`) |
| `suburb/*.glb`, `suburb/Textures/colormap.png` | City Kit (Suburban) 2.0 | Kenney | https://kenney.nl/assets/city-kit-suburban | CC0 (`suburb/License.txt`) |
| `cars/*.glb`, `cars/Textures/colormap.png` | Car Kit | Kenney | https://kenney.nl/assets/car-kit | CC0 (`cars/License.txt`) |

`src/world/avatar3d.js` builds each person from an outfit file (body, legs, feet) and a head file (face and hair) of the same rig, recolours the materials from the character creator, and adds a procedural sitting pose (the pack has no sitting clip).

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
