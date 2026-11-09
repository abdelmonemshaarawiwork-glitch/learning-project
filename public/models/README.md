# 3D anatomical model

## Bundled model

`makehuman-body.glb` — a realistic human body surface derived from the **MakeHuman base mesh hm08**, released under **CC0 1.0** by the MakeHuman project (Data Collection AB, Joel Palmius, Jonas Hauquier). See `LICENSE-MAKEHUMAN-ASSETS.md`. CC0 places no restriction on use or redistribution; attribution is given voluntarily.

It is divided into one mesh per body segment surface used by the clinical datasets (33 meshes: head, neck, trunk, buttocks, genitalia, upper arm, forearm, hand, thigh, lower leg and foot — left/right, anterior/posterior) plus non-selectable eyes. `manifest.json` maps mesh names to segments and records the source URLs and SHA-256 hashes of the inputs.

**The region boundaries were generated automatically** (skeleton skinning weights, geometric rules for buttocks/genitalia, surface normals and palm direction for anterior/posterior) and have **not** been clinically reviewed (`anatomicallyReviewed: false`). The viewer states this. See `docs/CLINICAL_VALIDATION.md`.

### Rebuilding

```bash
mkdir -p /tmp/mh && cd /tmp/mh
curl -O https://raw.githubusercontent.com/makehumancommunity/makehuman/master/makehuman/data/3dobjs/base.obj
curl -O https://raw.githubusercontent.com/makehumancommunity/makehuman/master/makehuman/data/rigs/default_weights.mhw
cd -   # back to the project
npm run model -- /tmp/mh            # writes public/models/makehuman-body.glb and manifest.json
```

Segmentation parameters (gluteal and genital bounds) can be adjusted with `BT_SEG_PARAMS='{"glutealTop":2.1,"foldBelow":-0.35,"genitalTop":0.75,"genitalHalfWidth":0.55}'` (MakeHuman decimetres).

## Using a different model

Replace the GLB and write a `manifest.json` that validates against `src/features/body-mapping/model3d/modelManifest.ts`:

```json
{
  "file": "anatomical-body.glb",
  "name": "Example anatomical model",
  "version": "1.0.0",
  "license": { "name": "CC-BY-4.0", "url": "https://creativecommons.org/licenses/by/4.0/", "attribution": "Author, source", "redistributionPermitted": true },
  "anatomicallyReviewed": false,
  "reviewNotes": "",
  "forwardAxis": "+z",
  "scale": 1,
  "offsetY": 0,
  "meshRegions": {
    "Head_Front": { "segment": "head", "surface": "anterior" },
    "Thigh_L": { "segment": "thigh-left" }
  }
}
```

* Segments: `head`, `neck`, `trunk`, `buttock-left`, `buttock-right`, `genitalia`, `upper-arm-left|right`, `forearm-left|right`, `hand-left|right`, `thigh-left|right`, `leg-left|right`, `foot-left|right`.
* Without `surface`, the tapped face normal decides anterior/posterior relative to `forwardAxis`.
* Do not use Draco or Meshopt compression (the app does not load decoders: no CDN, no WebAssembly).
* An invalid manifest or a model that fails to load falls back to the labelled schematic mannequin.
* Files in this folder are precached by the service worker for offline use.
