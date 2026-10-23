# AR Cabinetry (working title): project handoff

Read this first in every session. Session-by-session history is in `SESSION.md`; add to it at the end of each session.

## The idea

An iPhone AR app that:
1. **Scans** a room's walls (Apple RoomPlan, LiDAR iPhones).
2. **Generates** modern European frameless cabinetry that fits the space: bath vanity, closet built-in, bookshelf/wall unit, eventually kitchens.
3. **Shows** the design in the room in AR (RealityKit).
4. **Exports** CNC-ready job files with every hole already placed: Blum hinge cups, 32mm system holes, drawer runner holes, joinery.
5. **Posts** the job to a manufacturing board, where shops pick up the work. **We make money as the lead generator / platform**, not as the manufacturer.

## Ground rules (decided)

- **Blake is not the manufacturer.** His shop is the **test/reference shop**: every design rule and file format is proven on his machine before any other shop sees it. No production orders.
- **Start with a bath vanity** (decided 2026-10-22). Closets and bookshelves come next. Kitchens come last, if ever (countertops, appliances and plumbing make them the hardest).
- **Flat-bed 3-axis only.** Every operation is machined from the top face of the sheet. **No edge boring** (a router can't drill into panel edges). This matches Blake's machine and the large pool of small VCarve/Aspire/ShopBot-class shops, which is the target supply side of the job board.
- **Rules, not AI geometry.** Cabinets come from a parametric library on the 32mm system. AI can suggest layouts and styles, but every part dimension is computed by rules so it's always buildable.
- **The scan is for design, not for cutting.** RoomPlan is off by about 1-2"; cabinets need about 1/16". The app must make the user confirm the key measurements, and every design gets scribe/filler allowances.

## Blake's shop (the reference machine)

- 5' x 10' CNC router. A full 4x8 or 1250x2500 sheet fits.
- Software: **VCarve** for CAM and **Mach3** for machine control.
- **No ATC.** Bits are changed by hand, so files must group operations by tool to keep bit changes to a minimum.
- **No edge bander.** Design for exposed plywood edges (the modern Euro look, e.g. Reform/Plykea) or for materials that don't need banding.
- Materials: wood and plastic sheet goods. *(Blake said "wood plastic". Confirm exact sheets and **measured** thicknesses before the first cut.)*
- Blake has built several production-grade pieces. He's an experienced CNC user, so skip the basics.

## Technical plan

### Phase 0: the cabinet engine (Windows, no Mac needed) ← **we are here**
A generator that turns cabinet parameters into cut-ready files:
- Input: overall W/H/D, material thickness, door/drawer layout, hardware choice, plumbing cutout.
- Output: a **DXF already laid out on the sheet**, plus a parts list/cut list and an assembly sheet.
- **DXF layer naming convention**: one layer per operation, carrying tool and depth, e.g. `DRILL_5MM_13D`, `POCKET_35MM_13D`, `DADO_19W_8D`, `CUTOUT_THRU`. In VCarve, save one toolpath template keyed to these layers. After that every job is import → apply template → save G-code for Mach3.
- Order the operations for manual tool changes: all drilling → cup pockets → dados/rabbets → profile cutouts (with tabs/onion skin) last.
- Joinery must be face-only: dado/rabbet + confirmat, or **Lamello Cabineo** (designed for CNC face-only machining). Hinge cups are cut as spiral pockets, not with a Forstner bit at spindle speed.
- Hardware data: Blum publishes the drilling specs (Clip top hinges + plates, system 32 lines at 37mm setback, Movento/Tandem/Legrabox runners). Encode them as data, not hard-coded numbers.

### Phase 1: first physical test (the vanity)
Cut and assemble one vanity on Blake's machine and check that every hole lines up. Passing this test proves the core of the idea.

Vanity v0 starting spec (change freely):
- Wall-hung (floating), roughly 30" W × 21" D × ~20" H box. The countertop ends up around 32-34".
- Frameless 3/4" (19mm) carcass. Hang it on a French cleat or a hanging rail.
- Top drawer U-notched around the sink trap; second drawer, or a hinged door pair, below.
- Blum hardware (exact model to pick: Movento vs Tandem for the runners, Clip top Blumotion hinges).
- Sink type to decide: vessel, undermount, or integrated top. This sets the top cutout and stretchers.

### Phase 2: the iPhone app
- Swift + RoomPlan + RealityKit. **Needs a LiDAR iPhone (Pro model)** for good scans. Confirm which iPhone Blake has.
- Builds: Blake **already has a paid Apple developer account**, so the cloud-build → TestFlight route works without a Mac, the same way Ragtime does it. The used M1 Mac mini (AR Police Trainer) makes local testing nicer but isn't required.
- The app calls the same cabinet engine (port it to Swift, or run it as a service).

### Phase 3: the job board
- Shops sign up with their machine profile (bed size, tool change, materials). Jobs are posted as file packages.
- Revenue options, still open: per-lead fee, % commission, or a monthly listing fee for shops. In the first brainstorm I suggested the stronger business is **selling the product as a brand and routing it to contract shops** (bigger margin, quality control). Blake has chosen lead-gen/platform for now; the brand route stays available.
- Lessons from others: Opendesk ("design online, local makers cut it") worked technically and struggled commercially. Semihandmade/Reform/Plykea make money selling the product, not leads.

## Open questions
- Product name.
- Exact materials and measured thicknesses; tooling list (bit diameters for the 5mm holes, cup pockets, dados, profiling).
- Which iPhone Blake has (LiDAR or not).
- Vanity specifics: size, sink type, drawer vs door layout, Blum models.
- Engine language: Python on Windows first, ported or wrapped for iOS later.

## Working notes for Claude
- Blake wants me to lead: decide, build and test without approval loops. Show visuals as local images opened on screen, not claude.ai artifacts. Price free/one-time options first.
- Launcher: Desktop shortcut "Claude AR Cabinetry" → `Claude_ARCabinetry.bat` (opens Claude Code in this folder).
