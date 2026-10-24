# Style research: modern European cabinets and built-ins

Researched 2026-10-23, before building the engine. **Conclusion: Blake is right.** Every modern look in this research is the same parts (gables/sides, bottom, top/stretchers, captured back, fronts, base, pull), changed by a few construction choices. The engine doesn't need "styles" as separate code. It needs about **8 switches** (front mounting has 5 options including Blake's recessed inset), and a style is just a preset of switch settings.

Visual sheet: `research/style_switches.png` (made by `research/style_switches.py`).

---

## The 8 style switches

### 1. Front mounting: how the doors and drawer fronts relate to the box (the biggest look-changer)
| Option | Look | What changes in the parts |
|---|---|---|
| **Full overlay** | The classic Euro look: fronts cover the whole box, so you only see a wall of fronts and gaps. | Fronts = box size minus reveals. Standard Blum hinge (full-crank / "full overlay" arm). Runners at the front edge. |
| **Inset (sides shown)** | Fronts sit *inside* the box, flush with the carcass edges, so the box reads as a frame around each front. The exposed ply edge becomes the detail (Reform / Plykea / Nakedkitchens look). | Fronts = opening minus reveals. Inset hinge (Blum 18mm-crank, e.g. 71M2750 family). Runners and hinge plates are set back by the front thickness. **Demands precision:** the gap is visible all the way round (about 3/32"-1/8"). |
| **Flush face (overlay + flush ends)** | A monolithic slab: the end panels come forward to the plane of the fronts, so the box disappears. "Milan" handleless look. | Full overlay fronts, plus an **applied end panel / gable** one front-thickness deeper. The door reveal at that side has to account for the end panel. |
| **Recessed inset (shadow front)** | Blake's addition (2026-10-23). Fronts sit *inside* the box and **set back ~1/2"-3/4"** from the carcass edges, so the top, sides and bottom stand proud and frame each front with a shadow line. | Same as inset, plus a `setback` value: hinge plates, runners and system holes move back by front thickness + setback. Fronts are sized the same as inset. In the engine it's just `mount: inset` with `insetSetback > 0`. |
| **Half overlay (shared gables)** | A run where the fronts each cover half of a shared middle gable. Common in closets and bookcases built as one big box. | The run is **one carcass with shared panels**, not separate boxes. Half-crank hinge (Blum 9.5mm crank). |

Sources say inset and half-overlay work is usually built with **shared panels**, and full overlay usually as **separate boxes**. So "separate boxes vs. shared-gable run" is a switch of its own (see #8).

### 2. Grip: how you open it
| Option | Parts impact | CNC impact |
|---|---|---|
| **Top-mounted pull** (Blake's default) | Catalog item; 1-2 drilled holes or screws from behind | Drill points on the front |
| **Edge / lip pull** (clip over the top edge) | Catalog item, screwed from behind | Small rebate or none |
| **Routed finger groove / J-pull** | No hardware. A groove is cut into the top or back edge of the front | **Just a toolpath.** Great for CNC shops and costs nothing |
| **Cut-out hand-hole** (half-moon, circle, slot) | No hardware | Just a toolpath |
| **Channel (Gola-style)** | Aluminum C/L profile catalog item. **The box changes:** top stretcher and sides are notched, and the fronts drop or shorten | Notches in gables; profile is bought |
| **Push-to-open (Blum TIP-ON)** | Catalog item mounted in the box; hinges *without* spring | Drill points in the box |

### 3. Front surface
| Option | How it's made |
|---|---|
| **Slab** (default) | One panel. |
| **Fluted / reeded / grooved** (strong 2025-26 trend) | Slab + a ball-nose or V-bit toolpath pattern. **Pure CNC, no extra parts**, a strong reason this suits CNC shops. |
| **Slatted** | Slab + glued-on strips (trim boards). |
| **Slim Shaker** (still the most popular overall; the slim version reads modern) | A 5-piece frame (trim boards) around a 1/4" panel, or a one-piece CNC-routed recess. Later version. |

### 4. Base
| Option | Parts |
|---|---|
| **Recessed toe kick** (~4" tall, ~3" deep) | Notched gables, or a separate plinth box under the cabinets. |
| **Flush plinth** | Plinth board flush with the fronts. Modern, but people kick it. |
| **Legs / feet** | Catalog item. A lighter look; keeps bath vanities off wet floors. |
| **Wall-hung / floating** | No base. A **French cleat or hanging rail** to the studs. Forum guidance: about 10"+ off the floor reads as truly floating. **Default for vanity v0.** |

### 5. End panels and visible edges
- **Exposed ply edge** everywhere (the no-edge-bander look; Blake's shop). Note that an exposed edge means the *face grain direction and veneer quality* of the visible parts matter, so the nest has to respect grain.
- **Applied end panel**: flush with the fronts (see flush face) or proud of them.
- **Thick gable / waterfall end**: doubled or mitered end panel. Later version.
- **Scribe filler** where a box meets a wall: at least 3/4" wide, scribed to the wall, with a 1/8" reveal to the door to match the door gaps.

### 6. Top
- **Separate countertop** (stone or solid surface, bought), or an **integrated ply top** (a vanity with a vessel sink, open shelves, built-ins).
- **Sink cutout** comes from the catalog item's template (see the curated parts rule in CLAUDE.md).

### 7. Interior
- **Adjustable shelves** on the 32mm line (5mm holes, 37mm setback): drill points only.
- **Fixed shelves** in dados.
- **Hanging rail** (closet): catalog item + 2 drill points per side.
- **Drawers**: Blum Movento/Tandem rules: **inside drawer width = inside cabinet width − 42mm**, **drawer length = runner length − 10mm**, sides 16mm max. (Height rules: read from the Blum catalogue when we build the drawer module.)
- **Internal drawers behind doors** (closets): same drawer rules, set back for the hinge.

### 8. Run construction
- **Separate boxes** screwed together (kitchens, vanities, full overlay).
- **Shared-gable run** (one long carcass with shared dividers): closets, bookcases, inset and half-overlay work. Fewer parts and cheaper sheets, but it's one big piece to move, which matters for flat-pack.

---

## Global numbers (defaults, all adjustable)
- **Gap between fronts: 3mm (1/8").** The AWI premium tolerance is 3.2mm ± 0.8mm.
- **Reveal at outside ends: 1.5mm** (so two side-by-side boxes add up to 3mm between them).
- Top/bottom: common practice is 3mm at top and 0mm at the bottom of a base unit. We'll use the same 3mm everywhere unless a style changes it.
- Carcass: 3/4" ply (measured value). Back: 1/4" ply captured in a dado and glued. Fronts: 3/4" ply.
- System holes: 32mm pitch, 37mm from the front edge (Blum/Hettich standard). For inset, add the front thickness.
- Hinge cups: 35mm, about 10.5-13mm deep; exact boring distance from the hinge data.

## Style presets (built from the switches)
| Preset | Mounting | Grip | Surface | Base | Edges |
|---|---|---|---|---|---|
| **Classic Euro** | full overlay | top pull | slab | toe kick or wall-hung | exposed ply |
| **Ply Inset** (Reform/Plykea look) | inset | cut-out or edge pull | slab | legs or toe kick | exposed ply, frame shown |
| **Milan Flush** | flush face | J-groove or push-to-open | slab | recessed plinth or wall-hung | applied ends |
| **Fluted** | full overlay or inset | top pull | fluted | wall-hung | exposed ply |
| **Library/Closet Run** | half overlay or open | any | slab | flush plinth | shared gables |

## What this means for the engine
1. The **box primitive** takes `mount` (`overlay`/`inset`/`half`) because it moves hinge plates, runners and system holes back by the front thickness.
2. The **front generator** takes the opening plus `mount` + global reveals and produces exact front sizes. Grip and surface are **operations added to a front** (holes, groove, pattern), not new parts.
3. **Base, end panels, fillers and top** are add-on parts around the box run.
4. **Run builder** chooses separate boxes or shared gables.
5. Hardware (hinges by crank type, runners, TIP-ON, pulls, legs, Gola profiles, sinks) all lives in the **catalog**.

Vanity v0 starts with: **Classic Euro**, wall-hung, exposed ply. Inset and fluted come next because they're the most CNC-friendly differentiators.

## Sources
- Overlay types and inset gaps: [Pine & Poplar: inset vs overlay](https://pineandpoplar.com/inset-vs-overlay-cabinet-doors), [Showplace: what is overlay](https://showplacecabinetry.com/tag/what-does-overlay-mean/), [Cabinet Now: overlay & inset guide](https://www.cabinetnow.com/how-tothe-guide-to-overlay-and-inset-cabinet-doors/)
- Shared panels vs separate boxes, 32mm: [Wikipedia: frameless construction](https://en.wikipedia.org/wiki/Frameless_construction)
- Reveals, fillers, end panels: [WOODWEB: frameless door dimensions & tolerances](https://woodweb.com/knowledge_base/Frameless_Cabinet_Door_Dimensions.html), [WOODWEB: fillers on frameless](https://woodweb.com/knowledge_base/Fillers_on_frameless_cabinets.html), [Sawmill Creek: 32mm reveals](https://sawmillcreek.org/threads/32mm-frameless-cabinets-end-panel-top-bottom-crown-reveals.265926/), [Microvellum community: applied ends](https://community.microvellum.com/portal/en/community/topic/filler-shadows-need-their-own-global)
- Blum hinges: [Blum catalogue (gap tables)](https://publications.blum.com/2022/catalogue/en/87/), [71M2750 inset hinge listing](https://c0000568.a.getyouonline.co.uk/71m2750-clip-top-concealed-cabinet-hinge-100-inset-application)
- Blum drawers: [Blum: building a MOVENTO drawer](https://ea.blum.com/en/building-a-movento-drawer/), [Popular Woodworking: sizing for TANDEM](https://popularwoodworking.com/editors-blog/sizing-parts-for-drawers-on-blum-tandem-slides)
- Handleless: [Blum TIP-ON](https://www.blum.com/us/en/products/motion-technologies/tip-on/overview/), [RTA Cabinet Store: 4 handleless methods](https://blog.rtacabinetstore.com/?p=5392)
- Exposed ply fronts: [Dezeen: Plykea](https://www.dezeen.com/2017/05/12/plykea-hacks-ikea-metod-kitchen-plywood-front-design/amp/), [Nakedkitchens birch ply front](https://www.nakedkitchens.com/us/collections/products/birch-ply-scandi-front), [GBA: exposed-edge ply cabinetry](https://www.greenbuildingadvisor.com/question/kerf-designs-plywood-cabinetry-with-exposed-edge-details)
- Bases and floating: [Homes & Gardens: toe kicks vs plinths](https://www.homesandgardens.com/news/toe-kicks-versus-plinths), [WOODWEB: supporting floating base cabinets](https://woodweb.com/knowledge_base/How_to_Support_Floating.html)
- Front trends: [Domino: 2026 cabinet styles](https://www.domino.com/design-by-room/best-kitchen-cabinet-style-2026), [Ideal Home: 2026 trends](https://www.idealhome.co.uk/all-rooms/kitchen/kitchen-cabinet-trends-2026)


## Display names (2026-10-23)
Shown as **Slab** = classic-euro (full overlay), **Frame** = ply-inset, **Shadow** = recessed-inset, **Flush** = milan-flush: plain words, no trademark or false-origin issues (see `DESIGN.md`). Preset ids are unchanged.
