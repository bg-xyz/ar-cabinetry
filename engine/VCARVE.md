# Cutting a job in VCarve + Mach3 (Blake's test shop)

Set this up once. After that every job is: import DXF → apply template → save G-code.

## The layers in every DXF
| Layer | Toolpath | Tool (suggested) |
|---|---|---|
| `DRILL_5_D13` | Drilling, 13mm deep (hinge plates, runner screws) | 5mm drill / brad point |
| `DRILL_8_D11` | Drilling, 11mm deep (hinge dowels) | 8mm drill |
| `DRILL_3p5_D12` | Drilling, 12mm deep (pull screw pilots) | 1/8"-3.5mm drill |
| `DRILL_6_D10` | Drilling, 10mm deep (drawer runner rear hooks) | 6mm drill |
| `POCKET_D13` | Pocket, 13mm deep (35mm hinge cups) | 1/4" end mill |
| `POCKET_D6` | Pocket, 6mm deep (dados, rabbets, back/bottom grooves) | 1/4" end mill |
| `POCKET_D7p5` | Pocket, 7.5mm deep (drawer box rabbets) | 1/4" end mill |
| `CUT_INSIDE` | Profile **inside**, through (sink drain, faucet, plumbing) | 1/4" compression |
| `CUT_OUTSIDE` | Profile **outside**, through, with tabs or onion skin. **Run last.** | 1/4" compression |
| `LABELS`, `SHEET` | No toolpath (reference only) | n/a |

The layer name *is* the instruction: `D13` = 13mm deep, `p` = decimal point. New jobs reuse the same names, so one template covers them all.

## One-time setup
1. **Import** a sheet DXF (File → Import Vectors). Units: the files are in **inches** by default (`--units mm` for mm). Job size = the sheet (5x5 Baltic birch, or 4x8). **Z zero at the spoilboard is safest for through cuts.** The material thickness must match the measured value in `catalog/materials.json`.
2. For each layer above, select the vectors on that layer (Layers panel → right-click → *Select all vectors on layer*) and create the toolpath shown.
3. **Order for manual tool changes:** all drilling (change bits between diameters) → all pockets (one end mill) → `CUT_INSIDE` → `CUT_OUTSIDE`.
4. Save the toolpaths as a **toolpath template** (Toolpaths → Save Toolpath Template). Newer VCarve versions can tie each template toolpath to a layer name, so applying the template to a new job picks up the right vectors automatically. If yours doesn't, re-select by layer (step 2); it takes a minute.
5. Post with your Mach3 post-processor as usual.

## Before the first real cut
- Read the **"Check before cutting"** box on `jobsheet.html`. It lists every hardware number not yet confirmed from Blum's sheets (hinge cup edge distance, runner screw height, rear hook spec).
- Measure the plywood and update `catalog/materials.json`, then re-run the job.
- Cut a **hinge test**: one door and one side offcut. Mount a hinge and check the overlay and gap before cutting the whole vanity.
- Pockets that run off a part edge are drawn past the edge on purpose (into the waste between parts) so the cutter leaves clean ends.
