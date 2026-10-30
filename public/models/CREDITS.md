# Models

Drop CC0 glTF files here and name them in `manifest.json`. Until a file is listed, CampusVille draws stylised boxes.

Intended kits, both CC0:

- [Kenney City Kit](https://kenney.nl/assets/city-kit-suburban), [Furniture Kit](https://kenney.nl/assets/furniture-kit), and [Nature Kit](https://kenney.nl/assets/nature-kit) — CC0
- [Quaternius animated characters](https://quaternius.com/) — CC0

## In use

| Files | Pack | Author | Source | Licence |
| --- | --- | --- | --- | --- |
| `characters/character-*.glb`, `characters/Textures/colormap.png` | Mini Characters 1.0 (6 of the 12 characters) | Kenney | https://kenney.nl/assets/mini-characters | CC0 (`characters/License.txt`) |

`src/world/avatar3d.js` loads these for the player, Zanele and the students on campus. It swaps the palette texture for vertex colours, so the character creator sets skin, hair, top, trousers and shoes. Clips used: `idle`, `walk`, `sit`, `static`, `interact-right`.

`manifest.json` maps a place id or a place kind to a URL under `/models/`. The character field is reserved for the rigged student in a later pass.

```json
{
  "buildings": { "library": "/models/library.glb" },
  "kinds": { "lecture": "/models/lecture.glb" },
  "character": ""
}
```
