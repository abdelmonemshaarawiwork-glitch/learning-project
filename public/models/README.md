# 3D anatomical model integration

No licensed anatomical 3D model is bundled. Until one is installed, the 3D viewer uses a
**temporary development mannequin** (procedural geometry, `src/features/body-mapping/model3d/mannequin.ts`)
that is clearly labelled in the UI as *not anatomically accurate*.

## Installing a verified model

1. Obtain a glTF 2.0 model (`.glb` preferred) whose licence permits redistribution inside this
   application (e.g. CC0 / CC-BY with attribution, or a commercial licence that covers it).
   Ideally it is segmented into one mesh per body segment and surface.
2. Copy it here, e.g. `public/models/anatomical-body.glb`.
3. Create `public/models/manifest.json`:

```json
{
  "file": "anatomical-body.glb",
  "name": "Example anatomical model",
  "version": "1.0.0",
  "license": {
    "name": "CC-BY-4.0",
    "url": "https://creativecommons.org/licenses/by/4.0/",
    "attribution": "Author name, source",
    "redistributionPermitted": true
  },
  "anatomicallyReviewed": false,
  "reviewNotes": "",
  "forwardAxis": "+z",
  "scale": 1,
  "offsetY": 0,
  "meshRegions": {
    "Head_Front": { "segment": "head", "surface": "anterior" },
    "Head_Back": { "segment": "head", "surface": "posterior" },
    "Thigh_L": { "segment": "thigh-left" }
  }
}
```

* `meshRegions` maps mesh names to body segments (`head`, `neck`, `trunk`, `buttock-left`,
  `buttock-right`, `genitalia`, `upper-arm-left|right`, `forearm-left|right`, `hand-left|right`,
  `thigh-left|right`, `leg-left|right`, `foot-left|right`).
* When `surface` is omitted, the clicked face normal decides anterior/posterior relative to `forwardAxis`.
* The manifest is validated at runtime (`modelManifest.ts`). An invalid manifest is reported in the
  viewer and the development mannequin is used instead.
* Set `anatomicallyReviewed` to `true` only after review by a qualified person.
* Files in this folder are precached by the service worker for offline use.
