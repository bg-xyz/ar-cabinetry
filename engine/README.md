# Cabinet engine

Run spec (a wall of cabinets, in inches or mm) → 3D parts → CNC job package. TypeScript, no build step: Node 24 runs the `.ts` files directly.

```
cd engine
npm run samples                      # build every spec in specs/ into ../jobs/
node src/cli.ts specs/vanity-48-run.json --open      # one job, open preview + job sheet
node src/cli.ts my.json --units mm --tool 6.35 --out ../jobs/test
npm test                             # 26 checks (see below)
npx tsc                              # type check
python tools/check_dxf.py ../jobs/vanity-48-run      # independent DXF audit + sheet PNGs (needs: pip install ezdxf)
```

## What comes out (`jobs/<name>/`)
| File | For |
|---|---|
| `preview.html` | 3D view you can spin, open doors / pull drawers. Same data the AR app will draw. |
| `jobsheet.html` | Printable shop sheet: check-before-cutting list, hardware, CNC layer legend, sheet maps, cut list. |
| `sheets/*.dxf` | One per sheet, layered by operation (see `VCARVE.md`). |
| `cutlist.csv` | Every part, mm + inches, which sheet. |
| `parts.json` | 3D parts + fixtures (sink, faucet, pulls). The iPhone app reads this. |

## How it's built (matches CLAUDE.md "Engine architecture")
- `src/cabinet.ts`: **the box primitive + front layout + hardware.** Every hole and dado is placed in 3D world coordinates.
- `src/run.ts`: cabinets side by side along a wall, plus the countertop, sinks, faucet and plumbing cutouts.
- `src/flatten.ts`: 3D part → 2D CNC drawing (face A up, grain along length). **Throws** if any operation is off the face or off the part, so bad geometry never reaches a file.
- `src/nest.ts`: simple shelf nesting. Exposed parts keep their grain; hidden parts may rotate.
- `src/dxf.ts`: R12 DXF, one layer per operation and depth.
- `src/job.ts`: writes the package. `viewer/preview.html` is the 3D template.
- `catalog/*.json`: **materials, hinges, runners, pulls, sinks, faucets as data.** Anything not confirmed from Blum is flagged in a `verify` field and printed on the job sheet.
- `src/catalog.ts`: style presets (Classic Euro, Ply Inset, Recessed Inset, Milan Flush). Presets are just switch settings from STYLES.md.

## Spec format (see `specs/`)
```json
{ "name": "...", "units": "in", "style": { "preset": "classic-euro" }, "mounting": "wall-hung", "elevation": 10.25,
  "cabinets": [ { "id": "A", "width": 30, "height": 20, "depth": 20,
                  "zones": [ { "type": "doors", "size": "fill", "count": 2 } ] } ],
  "top": { "material": "bb18", "overhangSides": 0, "overhangFront": 0.5 },
  "sinks": [ { "cabinet": "A", "sink": "vessel-round-16", "faucet": "vessel-single-hole" } ] }
```
Zones go bottom to top: `{ "type": "drawer", "size": 5 }` or `"fill"`, `{ "type": "doors", "count": 1, "hinge": "right" }`. Any style field can be overridden, e.g. `"style": { "preset": "recessed-inset", "insetSetback": 0.625, "grip": "groove" }`.

## Tests (`test/engine.test.ts`)
For every sample spec plus extra variants (inset drawers, recessed single door, groove grip):
- designs, flattens and nests with no errors;
- **parts only overlap where joinery was machined.** Every place two parts intersect must be wood that a dado, rabbet or groove removed. This catches a wrong panel size or a missing dado. (Verified by breaking a rabbet on purpose: the test failed.)
- fronts keep the global gap;
- nested parts stay on the sheet and at least one cutter apart;
- Blum drawer rules (inside = opening − 42, length = runner − 10);
- a drawer under a sink drain is refused with a warning.
