# Plywise engine

*Built for your walls.* **The open-source cabinet engine behind [Plywise](https://plywise.xyz): a wall goes in, modern European cabinetry designed for it comes out, with every CNC file a shop needs to cut it.**

Contemporary Euro cabinets (vanities, built-ins, dressers, desks, counters) are all the same parametric plywood box, assembled in different combinations of doors and drawers. This engine turns that idea into code:

- **Planner:** give it a wall (length, ceiling, doors, windows, fixtures) and what you're building: vanity, built-in bookcase, media console, dresser, desk, coffee bar or kitchen island. It sizes the piece to the clear space, keeps the clearances, and adds scribe fillers where it meets the walls.
- **Proportion:** drawer stacks graduate by the golden ratio, top drawer lines line up along a run, widths split at the golden section, pulls scale to their fronts. A design critic checks every result against eight proportion rules.
- **Every part, every hole:** panels, dados, captured backs, Blum hinge cups and plates, drawer runner holes, confirmats only on hidden sides, connector holes that line up through neighbouring boxes.
- **CNC job package:** layered DXF per sheet (VCarve/Aspire-ready, face-only machining for flat-bed 3-axis routers without a tool changer), grain-matched fronts, cut list with scribe allowances, hardware and install kit, assembly steps, a quote, a fit-test coupon and a 3D preview.
- **Runs anywhere:** TypeScript with no runtime dependencies. Node, the browser (the share page at plywise.xyz/d/), or JavaScriptCore inside an app (`npm run bundle` → `engine/dist/plywise-engine.js`).

![style switches](research/style_switches.png)

## Try it
```
cd engine
npm install            # dev tools only (TypeScript, esbuild); the engine itself has no dependencies
npm run samples        # builds every spec in engine/specs/ into jobs/
npm test               # 180+ tests
node test/fuzz.ts      # random rooms through every build: refuse cleanly or build clean, no critic flags
node tools/elevations.ts out.html   # every build across a range of walls, drawn to scale
```
Open `jobs/<name>/preview.html` to spin a design around (switch finishes, open the drawers, download a .glb for Blender) and `jobsheet.html` for the shop sheet. Node 24+ runs the `.ts` files directly.

## Docs
- `engine/README.md`: architecture, spec format, tests
- `engine/VCARVE.md`: cutting a job in VCarve + Mach3
- `STYLES.md`: the 8 construction switches every modern cabinet style reduces to

## The app
The Plywise iPhone and Vision Pro app (room scanning, AR placement, saved rooms) is built on this engine and is not part of this repository.

## License
GNU Affero General Public License v3.0 (`AGPL-3.0-only`). See `LICENSE`. Use it, study it, change it and cut with it. If you ship something built on it, including a hosted service, you publish your source under the same license. Copies released earlier under Apache-2.0 keep those terms.

Contributions: see `CONTRIBUTING.md`. The Plywise name and logo are trademarks and aren't covered by the license. Hardware data (Blum CLIP top, TANDEM) comes from Blum's published specs; values not yet confirmed are flagged in `engine/catalog/*.json` and printed on every job sheet. Wood textures: [ambientCG](https://ambientcg.com), CC0.
