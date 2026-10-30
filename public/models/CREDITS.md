# Models

Drop CC0 glTF files here and name them in `manifest.json`. Until a file is listed, CampusVille draws stylised boxes.

Intended kits, both CC0:

- [Kenney City Kit](https://kenney.nl/assets/city-kit-suburban), [Furniture Kit](https://kenney.nl/assets/furniture-kit), and [Nature Kit](https://kenney.nl/assets/nature-kit) — CC0
- [Quaternius animated characters](https://quaternius.com/) — CC0

`manifest.json` maps a place id or a place kind to a URL under `/models/`. The character field is reserved for the rigged student in a later pass.

```json
{
  "buildings": { "library": "/models/library.glb" },
  "kinds": { "lecture": "/models/lecture.glb" },
  "character": ""
}
```
