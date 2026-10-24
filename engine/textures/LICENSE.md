# Textures

All wood textures are from **ambientCG** (https://ambientcg.com) and are **CC0 1.0 (public domain)**: free to use, modify and ship in commercial apps, no attribution required (credited here anyway).

| Folder | ambientCG asset | Used for |
|---|---|---|
| `birch/` | Wood095 | Baltic birch face veneer |
| `ply-edge/` | Wood087 | exposed plywood edges (64 ply pairs per tile; the viewer scales it per material's ply count) |
| `white-oak/` | Wood049 | white oak veneer (colour map lightened + desaturated toward rift white oak) |
| `walnut/` | Wood051 | walnut veneer |

Each folder: `color.jpg` (1024, sRGB), `normal.jpg` (1024, OpenGL convention), `roughness.jpg` (512), downscaled from the 2K sets on 2026-10-23, for the web previews. `2k/` holds the full 2048 maps (colour matched to the 1K look) that the iPhone app bundles. Grain runs horizontally (texture u axis).
