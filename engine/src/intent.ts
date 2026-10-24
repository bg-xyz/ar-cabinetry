// Say what you're building. Turns a sentence ("a floating walnut double vanity, about five feet") into
// the same choices the build picker, style rollers and finish menu make, so the app can plan straight
// from the words. Rules, not a language model: it runs on the phone and the headset with no network,
// gives the same answer every time, and only ever picks things the planner knows how to build.

import { IN } from './units.ts';
import type { Project } from './planner.ts';

export type FinishId = 'birch' | 'white-oak' | 'walnut' | 'paint-white' | 'paint-sage' | 'paint-charcoal';
export type Heard = { kind: 'project' | 'size' | 'sinks' | 'style' | 'grip' | 'finish' | 'grain' | 'rhythm' | 'mounting'; label: string };

export interface Intent {
  text: string;
  project?: Project;
  /** asked for something the planner can't build yet (closets, kitchens): say so, don't guess */
  comingSoon?: 'closet' | 'kitchen';
  width?: number;                                   // mm, overall
  sinks?: 1 | 2;
  mounting?: 'wall-hung' | 'toe-kick' | 'legs';
  style: { preset?: string; grip?: 'pull' | 'groove' | 'push'; grainMatch?: 'across' | 'waterfall' | 'off'; rhythm?: 'golden' | 'even' };
  finishes: { fronts?: FinishId; cabinet?: FinishId; top?: FinishId };
  heard: Heard[];                                    // what was understood, in plain words, for the chips
  summary: string;                                   // one line: "A 60" double vanity · walnut · floating"
}

const PROJECT_NAMES: Record<Project, string> = {
  vanity: 'Bathroom vanity', bookcase: 'Built-in bookcase', console: 'Media console', dresser: 'Dresser',
  desk: 'Built-in desk', bar: 'Coffee bar', island: 'Kitchen island',
};
const NOUNS: Record<Project, string> = {
  vanity: 'vanity', bookcase: 'bookcase', console: 'media console', dresser: 'dresser', desk: 'desk', bar: 'coffee bar', island: 'island',
};

// [pattern, weight]: the object itself scores 3, the room it's in 1, so "a desk for the bedroom" is a desk
const PROJECT_WORDS: [Project | 'closet' | 'kitchen', RegExp, number][] = [
  ['island', /\bkitchen islands?\b|\bislands?\b/, 4],
  ['bar', /\bcoffee (bar|station|nook|corner|counter)s?\b|\b(espresso|beverage|drinks?|wine|tea|cocktail) (bar|station|counter)s?\b|\bback bar\b|\bcaf[eé] counter\b/, 4],
  ['bar', /\bcoffee\b|\bespresso\b|\bcaf[eé]s?\b|\bcoffee shop\b|\bbarista\b/, 2],
  ['vanity', /\bvanit(y|ies)\b|\bwashstands?\b|\b(bathroom|bath) (cabinet|sink)s?\b/, 4],
  ['vanity', /\bbath(room)?s?\b|\bpowder room\b|\bwash ?room\b|\blavatory\b|\bensuite\b|\bsinks?\b/, 1],
  ['desk', /\bdesks?\b|\bwork ?stations?\b|\bwriting table\b/, 4],
  ['desk', /\b(home )?office\b|\bstudy\b|\bwork from home\b|\bcomputer\b|\blaptop\b|\bmonitors?\b/, 1],
  ['dresser', /\bdressers?\b|\bchest of drawers\b|\bbureaus?\b|\bhighboy\b|\blowboy\b/, 4],
  ['dresser', /\bbedroom\b|\bclothes\b|\bsweaters?\b|\bsocks\b/, 1],
  ['console', /\b(media|tv|television|entertainment|stereo|record|vinyl|audio) (console|cabinet|unit|stand|center|centre)s?\b|\bcredenzas?\b|\bsideboards?\b|\bbuffets?\b|\bconsoles?\b|\btv stand\b/, 4],
  ['console', /\btv\b|\btelevision\b|\brecords?\b|\bvinyl\b|\bturntable\b|\bstereo\b|\bspeakers?\b|\bliving room\b|\bden\b|\bfamily room\b|\bdining room\b/, 1],
  ['bookcase', /\bbook ?(case|shel(f|ves)|wall)s?\b|\bshel(f|ves|ving)\b|\bbuilt-?ins?\b|\bwall units?\b|\blibrary\b|\bdisplay\b/, 3],
  ['bookcase', /\bbooks?\b|\breading\b|\bcollection\b/, 1],
  ['closet', /\bclosets?\b|\bwardrobes?\b|\bwalk-?in\b|\bhanging rails?\b|\bpantry\b/, 4],
  ['kitchen', /\bkitchen (cabinets?|run|wall|remodel)\b|\b(upper|lower|base) cabinets\b/, 4],
  ['kitchen', /\bkitchen\b/, 2],
];

const FINISH_WORDS: [FinishId, RegExp, string][] = [
  ['white-oak', /\bwhite oak\b|\b(light|blonde|pale|natural) (wood|oak)\b|\boak\b|\bscandi(navian)?\b|\bnordic\b|\bash\b/, 'White oak'],
  ['walnut', /\bblack walnut\b|\bwalnut\b|\bdark wood\b|\bdark timber\b/, 'Walnut'],
  ['birch', /\b(baltic )?birch\b|\bplywood\b|\bply\b|\braw wood\b/, 'Birch ply'],
  ['paint-sage', /\bsage\b|\bgreen\b|\bolive\b|\bmoss\b|\beucalyptus\b/, 'Sage'],
  ['paint-charcoal', /\bcharcoal\b|\bblack\b|\b(dark )?gr[ae]y\b|\bgraphite\b|\bslate\b/, 'Charcoal'],
  ['paint-white', /\b(warm |painted |all )?white\b|\bcream\b|\bivory\b|\boff-?white\b/, 'White'],
];
const ROLE_WORDS: [keyof Intent['finishes'], RegExp][] = [
  ['fronts', /^(fronts?|doors?|drawers?|faces?|drawer fronts?|cabinet doors?)$/],
  ['cabinet', /^(cabinets?|box(es)?|carcass(es)?|cases?|body|bodies|sides?|frames?|outside|exterior|shell|base)$/],
  ['top', /^(tops?|countertops?|counters?|surfaces?|slabs?)$/],
];

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
  thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90, half: 0.5,
};

/** Spoken numbers to digits: "seventy two" -> 72, "five and a half" -> 5.5, "six foot six" stays as words + digits. */
function digits(s: string): string {
  const w = Object.keys(NUMBER_WORDS).filter((k) => k !== 'half').join('|');
  return s
    .replace(new RegExp(`\\b(${w})(?:[ -](${w}))?\\b`, 'g'), (_m, a: string, b?: string) => {
      const x = NUMBER_WORDS[a], y = b ? NUMBER_WORDS[b] : 0;
      return String(x >= 20 && y > 0 && y < 10 ? x + y : b ? `${x} ${y}` : x);
    })
    .replace(/\b(\d+) and a half\b/g, (_m, n: string) => String(Number(n) + 0.5))
    .replace(/\b(\d+)(?:\s+and)?\s+(\d)\/(\d)\b/g, (_m, n: string, a: string, b: string) => String(Number(n) + Number(a) / Number(b)));
}

/** The overall width, if one was said: the first length not marked deep / tall / high. */
function width(s: string): { mm: number; label: string } | undefined {
  // feet + inches first ("6' 6"", "6 ft 6", "6 feet 6 inches"), then feet, inches, metric
  const unit = String.raw`(?:feet|foot|ft|')`;
  const re = new RegExp(String.raw`(\d+(?:\.\d+)?)\s*${unit}(?:\s*(\d+(?:\.\d+)?)\s*(?:inches|inch|in|"|”|'')?)?(?![a-z])|(\d+(?:\.\d+)?)\s*(?:inches|inch|in\b|"|”|'')|(\d+(?:\.\d+)?)\s*(mm|millimet(?:er|re)s?|cm|centimet(?:er|re)s?|m\b|met(?:er|re)s?)`, 'g');
  for (const m of s.matchAll(re)) {
    const after = s.slice(m.index! + m[0].length, m.index! + m[0].length + 14);
    if (/^\s*(deep|tall|high|height|depth)\b/.test(after)) continue;
    let mm: number;
    if (m[1] !== undefined) mm = (Number(m[1]) * 12 + (m[2] ? Number(m[2]) : 0)) * IN;
    else if (m[3] !== undefined) mm = Number(m[3]) * IN;
    else {
      const u = m[5];
      mm = Number(m[4]) * (u.startsWith('mm') || u.startsWith('milli') ? 1 : u.startsWith('c') ? 10 : 1000);
    }
    if (mm < 12 * IN || mm > 20 * 12 * IN) continue;  // not a believable width for one piece
    return { mm, label: `${Math.round(mm / IN)}" wide` };
  }
  return undefined;
}

/** What the sentence asks for. Anything it doesn't mention is left to the planner and the defaults. */
export function understand(text: string): Intent {
  const s = digits(` ${text.toLowerCase().replace(/[’`]/g, "'").replace(/[^a-z0-9.'"”/\- ]+/g, ' ').replace(/\s+/g, ' ')} `);
  const intent: Intent = { text, style: {}, finishes: {}, heard: [], summary: '' };
  const hear = (kind: Heard['kind'], label: string) => intent.heard.push({ kind, label });
  const has = (re: RegExp) => re.test(s);
  const no = (what: string) => new RegExp(String.raw`\b(no|without|not|don't want|never|skip( the)?)\s+(any\s+)?${what}`).test(s);

  // what: the highest score wins; a tie goes to whatever was said first
  const scores = new Map<string, { score: number; at: number }>();
  for (const [p, re, weight] of PROJECT_WORDS) {
    const m = s.match(re);
    if (!m) continue;
    const cur = scores.get(p) ?? { score: 0, at: Infinity };
    scores.set(p, { score: cur.score + weight, at: Math.min(cur.at, m.index!) });
  }
  // "sink" alone is a bathroom word, but not when it's a kitchen or coffee-bar sink
  if (scores.has('vanity') && !has(/\bvanit|\bbath|\bpowder|\bwash|\blavatory|\bensuite/) && (scores.has('island') || scores.has('kitchen') || scores.has('bar'))) scores.delete('vanity');
  const best = [...scores.entries()].sort((a, b) => b[1].score - a[1].score || a[1].at - b[1].at)[0]?.[0];
  if (best === 'closet' || best === 'kitchen') intent.comingSoon = best;
  else if (best) {
    intent.project = best as Project;
    hear('project', PROJECT_NAMES[intent.project]);
  }

  const w = width(s);
  if (w) { intent.width = w.mm; hear('size', w.label); }

  if (intent.project === 'vanity' || (!intent.project && !intent.comingSoon)) {
    if (has(/\b(double|twin|two|2|dual|his and hers|hers and his|pair of) (sinks?|basins?|bowls?|vanit(y|ies))\b|\bdouble\b|\bdual sinks?\b/)) intent.sinks = 2;
    else if (has(/\b(single|one|1) (sink|basin|bowl)\b|\bsingle\b/)) intent.sinks = 1;
    if (intent.sinks) {
      if (!intent.project) { intent.project = 'vanity'; hear('project', PROJECT_NAMES.vanity); }
      hear('sinks', intent.sinks === 2 ? 'Double sink' : 'Single sink');
    }
  }

  // how it stands
  const mount: [Intent['mounting'], RegExp, string][] = [
    ['wall-hung', /\bfloat(ing|s)?\b|\bwall[- ]?(hung|mounted|hanging)\b|\bhung on the wall\b|\boff the floor\b|\bsuspended\b/, 'Floating'],
    ['legs', /\blegs?\b|\bmid-?century\b|\bon feet\b/, 'On legs'],
    ['toe-kick', /\btoe[- ]?kick\b|\bplinth\b|\bto the floor\b|\bgrounded\b|\bsits on the floor\b|\bbuilt[- ]?in look\b/, 'Toe kick'],
  ];
  const canMount = intent.project === undefined || intent.project === 'vanity' || intent.project === 'console' || intent.project === 'dresser';
  for (const [m, re, label] of mount) {
    if (!canMount || !has(re) || (m === 'legs' && no('legs?'))) continue;
    intent.mounting = m; hear('mounting', label); break;
  }

  // style: the four presets, then the grip on its own
  const presets: [string, RegExp, string][] = [
    ['milan-flush', /\bflush\b|\bseamless\b|\bmonolith(ic)?\b/, 'Flush'],
    ['recessed-inset', /\bshadow( line|s|gap)?\b|\brecessed\b|\bset back\b|\bsetback\b|\breveal\b/, 'Shadow'],
    ['ply-inset', /\binset\b|\bframed?\b|\bframe style\b|\bexposed (ply|plywood|edges?)\b|\bplywood edges?\b/, 'Frame'],
    ['classic-euro', /\bslabs?\b|\bfull overlay\b|\boverlay\b|\bflat fronts?\b|\beuro(pean)?\b/, 'Slab'],
  ];
  for (const [id, re, label] of presets) if (has(re)) { intent.style.preset = id; hear('style', label); break; }
  if (has(/\bpush[- ]?(to[- ])?open\b|\bhandle-?less\b|\btouch latch\b|\b(no|without) (handles?|pulls?|hardware|knobs?)\b|\bclean (fronts?|faces?)\b/)) {
    intent.style.grip = 'push'; hear('grip', 'Push to open');
  } else if (has(/\bfinger (pulls?|grooves?|grips?)\b|\bgrooves?\b|\brouted (pulls?|grips?)\b|\bfinger[- ]?jointed pulls?\b|\bedge pulls?\b/)) {
    intent.style.grip = 'groove'; hear('grip', 'Finger groove');
  } else if (has(/\b(bar |brass |metal |long )?(pulls?|handles?)\b/) && !no('(pulls?|handles?)')) {
    intent.style.grip = 'pull'; hear('grip', 'Bar pulls');
  }

  // finishes: "walnut fronts", "fronts in walnut", "a white oak top"; a finish on its own is the whole piece
  const words = s.trim().split(' ');
  const mentions: { id: FinishId; label: string; at: number; end: number }[] = [];
  let rest = s;   // matched words are blanked out, so "white oak" isn't heard again as "white" (positions don't move)
  for (const [id, re, label] of FINISH_WORDS) {
    for (const m of [...rest.matchAll(new RegExp(re.source, 'g'))]) {
      const at = rest.slice(0, m.index!).trim().split(' ').filter(Boolean).length;
      const end = at + m[0].trim().split(' ').length;
      if (/^(walls?|rooms?|tiles?|floors?|ceilings?|paint)$/.test(words[end] ?? '')) continue;   // the room, not the piece
      mentions.push({ id, label, at, end });
    }
    rest = rest.replace(new RegExp(re.source, 'g'), (m) => m.replace(/[a-z]/g, '_'));
  }
  mentions.sort((a, b) => a.at - b.at);
  // "sage green", "charcoal grey": one colour said twice is one mention
  for (let k = mentions.length - 1; k > 0; k--) if (mentions[k].id === mentions[k - 1].id && mentions[k].at === mentions[k - 1].end) {
    mentions[k - 1].end = mentions[k].end;
    mentions.splice(k, 1);
  }
  const roleNear = (m: { at: number; end: number }): keyof Intent['finishes'] | undefined => {
    // "walnut fronts", "fronts in walnut", "the top is oak"
    const linked = /^(in|of|are|is|:|=)$/.test(words[m.at - 1] ?? '') ? words[m.at - 2] : words[m.at - 1];
    for (const wd of [words[m.end], linked]) for (const [role, re] of ROLE_WORDS) if (wd && re.test(wd)) return role;
    return undefined;
  };
  const untagged: FinishId[] = [];
  for (const m of mentions) {
    const role = roleNear(m);
    if (role && !intent.finishes[role]) intent.finishes[role] = m.id;
    else if (!role) untagged.push(m.id);
  }
  if (untagged.length) {
    // the first untagged finish is the piece; a second one goes on whatever is still open, box before top
    const [first, second] = untagged;
    for (const slot of ['fronts', 'cabinet', 'top'] as const) if (!intent.finishes[slot]) { intent.finishes[slot] = first; if (second) break; }
    if (second) for (const slot of ['cabinet', 'top'] as const) if (!intent.finishes[slot]) { intent.finishes[slot] = second; break; }
  }
  // painted tops are a bad idea (water rings, wear): a painted piece keeps a wood top unless one was asked for
  if (intent.finishes.top?.startsWith('paint-') && !mentions.some((m) => roleNear(m) === 'top')) delete intent.finishes.top;
  const label = (id: FinishId) => FINISH_WORDS.find((f) => f[0] === id)![2];
  const { fronts, cabinet, top } = intent.finishes;
  if (fronts && (cabinet ?? fronts) === fronts && (top === undefined || top === fronts)) hear('finish', label(fronts));
  else {
    if (fronts) hear('finish', `${label(fronts)} fronts`);
    if (cabinet && cabinet !== fronts) hear('finish', `${label(cabinet)} cabinet`);
  }
  if (top && top !== fronts) hear('finish', `${label(top)} top`);

  // grain + proportion
  if (has(/\bwaterfall\b|\bvertical grain\b|\bgrain (running|runs|going|flowing) (down|vertical)/)) { intent.style.grainMatch = 'waterfall'; hear('grain', 'Waterfall grain'); }
  else if (has(/\b(no|without|skip( the)?) grain match(ing|ed)?\b|\bbest yield\b|\bsave (plywood|material|money)\b|\bless waste\b|\bcheap(est|er)?\b|\bbudget\b|\beco\b/)) { intent.style.grainMatch = 'off'; hear('grain', 'Best yield'); }
  else if (has(/\bgrain[- ]?match(ing|ed)?\b|\bcontinuous grain\b|\bbook[- ]?match(ing|ed)?\b|\bgrain (flows|flowing|across)\b/)) { intent.style.grainMatch = 'across'; hear('grain', 'Grain across'); }
  if (has(/\b(equal|even|same[- ]size|identical|uniform) drawers?\b|\bdrawers? (all )?the same( size)?\b/)) { intent.style.rhythm = 'even'; hear('rhythm', 'Equal drawers'); }
  else if (has(/\bgolden\b|\bgraduated\b|\bphi\b/)) { intent.style.rhythm = 'golden'; hear('rhythm', 'Golden drawers'); }

  // one line back: "A 60" double vanity · walnut · floating"
  const bits: string[] = [];
  const noun = intent.project ? NOUNS[intent.project] : undefined;
  if (noun) bits.push(`A ${w ? `${Math.round(w.mm / IN)}" ` : ''}${intent.sinks === 2 && intent.project === 'vanity' ? 'double ' : ''}${noun}`);
  for (const h of intent.heard) if (!['project', 'size', 'sinks'].includes(h.kind) || (h.kind === 'sinks' && !noun)) bits.push(h.label.toLowerCase());
  if (intent.comingSoon) bits.unshift(intent.comingSoon === 'closet' ? 'Closet systems are coming soon' : 'Full kitchens are coming soon; an island, a coffee bar or a vanity works today');
  intent.summary = bits.length ? bits.join(' · ') : '';
  return intent;
}
