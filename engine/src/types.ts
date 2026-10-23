// Shared types for the cabinet engine. All lengths are millimetres.
//
// World frame (one cabinet run): origin at the back-left-bottom corner of the
// first carcass. x = right, y = up, z = toward the viewer (front of cabinet).

export type Vec3 = [number, number, number];
export type Axis = 0 | 1 | 2;
export type Face = '+x' | '-x' | '+y' | '-y' | '+z' | '-z';

export interface Box3 {
  min: Vec3;
  size: Vec3;
}

// Machining, described in world coordinates on the part's face A plane.
// Keeping hardware positions in world space is what keeps the AR model and
// the CNC files from ever disagreeing.
export type WorldOp =
  | { kind: 'hole'; at: Vec3; dia: number; depth: number; note: string; thru?: boolean }
  | { kind: 'pocket'; from: Vec3; to: Vec3; depth: number; note: string }
  | { kind: 'cutRect'; from: Vec3; to: Vec3; note: string }
  | { kind: 'cutCircle'; at: Vec3; dia: number; note: string };

export type PartRole =
  | 'side' | 'bottom' | 'stretcher' | 'back' | 'rail' | 'top'
  | 'door' | 'drawerFront'
  | 'drawerSide' | 'drawerBoxFront' | 'drawerBack' | 'drawerBottom';

export interface Part {
  id: string;
  name: string;
  cabinet: string;
  role: PartRole;
  material: string;
  box: Box3;
  faceA: Face;          // the face that gets machined (it faces up on the CNC)
  grain: Axis | null;   // world axis the face grain runs along
  exposed: boolean;     // visible when the piece is installed (grain + edge quality matter)
  ops: WorldOp[];
}

// ---- flattened (CNC) form -------------------------------------------------

export type FlatOp =
  | { kind: 'hole'; x: number; y: number; dia: number; depth: number; note: string; thru?: boolean }
  | { kind: 'pocket'; x0: number; y0: number; x1: number; y1: number; depth: number; note: string }
  | { kind: 'cutRect'; x0: number; y0: number; x1: number; y1: number; note: string }
  | { kind: 'cutCircle'; x: number; y: number; dia: number; note: string };

export interface FlatPart {
  id: string;
  name: string;
  material: string;
  thickness: number;
  length: number;       // along grain (sheet x when not rotated)
  width: number;
  grainLocked: boolean; // may not be rotated 90 degrees when nesting
  ops: FlatOp[];
}

// ---- catalog ---------------------------------------------------------------

export interface Material {
  name: string;
  thickness: number;
  sheet: [number, number];
  verify?: string;
}

export interface Hinge {
  name: string;
  mount: 'overlay' | 'inset';
  cupDia: number;
  cupDepth: number;
  cupEdgeDistance: number;
  dowelDia: number;
  dowelDepth: number;
  dowelPitch: number;
  dowelOffset: number;
  plate: { name: string; holeDia: number; holeDepth: number; holeSpacing: number; setbackFromFront: number };
  verify?: string;
}

export interface Runner {
  name: string;
  lengths: number[];
  insideWidthDeduction: number;
  lengthDeduction: number;
  maxSideThickness: number;
  bottomRecess: number;
  frontSetback: number;
  firstHoleFromFront: number;
  holeAboveRunnerBottom: number;
  holeDia: number;
  holeDepth: number;
  topClearance: number;
  rearHook: { dia: number; depth: number; aboveBottomPanel: number; fromSide: number };
  verify?: string;
}

export interface Pull {
  name: string;
  holes: number[];       // hole offsets from pull centre, horizontal
  fromTopEdge: number;   // pull centre line below the top edge of the front
  holeDia: number;
  holeDepth?: number;    // blind holes (screws from behind)
  thru?: boolean;        // face-mounted pull: through holes, screws from the back
  size?: Vec3;           // for the 3D model
  fromOpeningEdge?: number; // doors: pull centre distance from the opening edge
  buy?: string | null;
  verify?: string;
}

export interface Sink {
  name: string;
  kind: 'vessel';
  bowl: [number, number]; // width x depth of the bowl footprint
  drainHole: number;
  buy?: string | null;
}

export interface Faucet {
  name: string;
  holeDia: number;
  gapBehindBowl: number;
  buy?: string | null;
}

export interface Catalog {
  materials: Record<string, Material>;
  hinges: Record<string, Hinge>;
  runners: Record<string, Runner>;
  pulls: Record<string, Pull>;
  sinks: Record<string, Sink>;
  faucets: Record<string, Faucet>;
}

// ---- design input ----------------------------------------------------------

export type Mount = 'overlay' | 'inset';
export type Grip = 'pull' | 'groove' | 'push';

export interface Style {
  name: string;
  mount: Mount;
  insetSetback: number;   // inset only: how far fronts sit back from the carcass edge
  grip: Grip;
  gap: number;            // between fronts
  endReveal: number;      // overlay: front edge to carcass outside edge
  topReveal: number;
  bottomReveal: number;
  carcass: string;        // material ids
  back: string;
  fronts: string;
  drawerBox: string;
  drawerBottom: string;
  hinge: string;          // catalog ids
  runner: string;
  pull: string;
  dadoDepth: number;
  grooveDepth: number;
  stretcherWidth: number;
}

export type Zone =
  | { type: 'drawer'; size: number | 'fill' }
  | { type: 'doors'; size: number | 'fill'; count: 1 | 2; hinge?: 'left' | 'right' };

export interface CabinetSpec {
  id: string;
  width: number;
  height: number;
  depth: number;
  zones: Zone[];          // bottom to top
}

export interface SinkSpec {
  cabinet: string;
  sink: string;
  faucet: string;
  offsetX?: number;       // from the cabinet centre
  setback?: number;       // top front edge to bowl centre
}

export interface RunSpec {
  name: string;
  units?: 'mm' | 'in';
  style?: Partial<Style> & { preset?: string };
  mounting: 'wall-hung';
  elevation: number;      // carcass bottom above the floor
  cabinets: CabinetSpec[];
  top?: { material: string; overhangSides: number; overhangFront: number };
  sinks?: SinkSpec[];
  plumbing?: { width: number; bottom: number; top: number }; // back cutout, heights above floor
}

// Bought items shown in the 3D/AR model but never cut (sinks, faucets, pulls).
export interface Fixture {
  kind: 'sink' | 'faucet' | 'pull';
  shape: 'box' | 'round';
  name: string;
  box: Box3;
}

export interface HardwareLine {
  item: string;
  qty: number;
  buy?: string | null;
}

export interface Design {
  spec: RunSpec;
  style: Style;
  parts: Part[];
  hardware: HardwareLine[];
  fixtures: Fixture[];
  warnings: string[];
  overall: { width: number; height: number; depth: number; elevation: number };
}
