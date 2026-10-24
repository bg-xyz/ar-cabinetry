// "Say what you're building": sentences people actually say -> the build, size, style and finishes.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { understand } from '../src/intent.ts';
import { plan } from '../src/planner.ts';
import { IN } from '../src/units.ts';

const say = (text: string) => understand(text);

test('the build: the object beats the room it is in', () => {
  const cases: [string, string | undefined][] = [
    ['a floating vanity for our bathroom', 'vanity'],
    ['double sink vanity', 'vanity'],
    ['something for the powder room', 'vanity'],
    ['built in bookshelves on either side of the fireplace', 'bookcase'],
    ['a wall of shelves for my books', 'bookcase'],
    ['a low credenza for the record player and vinyl', 'console'],
    ['media console under the TV', 'console'],
    ['a TV stand in walnut', 'console'],
    ['a dresser for the bedroom', 'dresser'],
    ['chest of drawers', 'dresser'],
    ['a desk for my home office', 'desk'],
    ['a desk in the bedroom', 'desk'],
    ['coffee bar in the kitchen', 'bar'],
    ['a coffee station for our office', 'bar'],
    ['back bar for a modern coffee shop', 'bar'],
    ['an espresso bar', 'bar'],
    ['kitchen island with seating', 'island'],
    ['an island with a sink', 'island'],
    ['make it beautiful', undefined],
  ];
  for (const [text, project] of cases) assert.equal(say(text).project, project, text);
});

test('closets and full kitchens are coming soon, not guessed at', () => {
  assert.equal(say('a walk-in closet').comingSoon, 'closet');
  assert.equal(say('a walk-in closet').project, undefined);
  assert.equal(say('new kitchen cabinets').comingSoon, 'kitchen');
  assert.match(say('new kitchen cabinets').summary, /coming soon/);
  assert.equal(say('kitchen island').comingSoon, undefined);
});

test('sizes in feet, inches, words and metric; depth and height are not the width', () => {
  const w = (t: string) => Math.round((say(t).width ?? 0) / IN * 10) / 10;
  assert.equal(w('a 60 inch vanity'), 60);
  assert.equal(w('60" double vanity'), 60);
  assert.equal(w('five feet wide'), 60);
  assert.equal(w('a six foot dresser'), 72);
  assert.equal(w("6' 6\" console"), 78);
  assert.equal(w('seventy two inches'), 72);
  assert.equal(w('about 5 and a half feet'), 66);
  assert.equal(Math.round(w('1500mm vanity')), 59);
  assert.equal(Math.round(w('1.8 m bookcase')), 71);
  assert.equal(Math.round(w('a 150 cm desk')), 59);
  assert.equal(w('22 inches deep, 48 inches wide'), 48);
  assert.equal(say('a dresser 30 inches tall').width, undefined);
  assert.equal(say('two drawers').width, undefined);
});

test('sinks, mounting, style, grip, grain, rhythm', () => {
  const a = say('a floating double vanity with walnut fronts, push to open');
  assert.equal(a.project, 'vanity');
  assert.equal(a.sinks, 2);
  assert.equal(a.mounting, 'wall-hung');
  assert.equal(a.style.grip, 'push');
  assert.equal(a.finishes.fronts, 'walnut');
  assert.equal(say('his and hers sinks').sinks, 2);
  assert.equal(say('single sink vanity').sinks, 1);
  assert.equal(say('a double dresser').sinks, undefined);           // not a vanity: "double" means wide
  assert.equal(say('mid-century media console').mounting, 'legs');
  assert.equal(say('a dresser with no legs, toe kick').mounting, 'toe-kick');
  assert.equal(say('a desk on legs').mounting, undefined);           // desks stand on their pedestals
  assert.equal(say('shadow line fronts').style.preset, 'recessed-inset');
  assert.equal(say('inset doors so the plywood frames them').style.preset, 'ply-inset');
  assert.equal(say('flush and seamless').style.preset, 'milan-flush');
  assert.equal(say('no handles please').style.grip, 'push');
  assert.equal(say('finger grooves instead of pulls').style.grip, 'groove');
  assert.equal(say('long brass pulls').style.grip, 'pull');
  assert.equal(say('waterfall grain down the drawers').style.grainMatch, 'waterfall');
  assert.equal(say('keep it cheap, best yield').style.grainMatch, 'off');
  assert.equal(say('all the drawers the same size').style.rhythm, 'even');
});

test('finishes: on their own they are the piece; with a role they go where they are told', () => {
  assert.deepEqual(say('a walnut dresser').finishes, { fronts: 'walnut', cabinet: 'walnut', top: 'walnut' });
  assert.deepEqual(say('white oak fronts with a walnut top').finishes, { fronts: 'white-oak', top: 'walnut' });
  assert.deepEqual(say('fronts in sage green, oak cabinet').finishes, { fronts: 'paint-sage', cabinet: 'white-oak' });
  assert.equal(say('white oak console').finishes.fronts, 'white-oak');      // white oak, not white
  assert.equal(say('black walnut desk').finishes.fronts, 'walnut');
  // a painted piece keeps its wood top (paint on a top wears through)
  assert.deepEqual(say('a charcoal vanity').finishes, { fronts: 'paint-charcoal', cabinet: 'paint-charcoal' });
  // the room's colours are not the piece's
  assert.deepEqual(say('a walnut console against white walls').finishes, { fronts: 'walnut', cabinet: 'walnut', top: 'walnut' });
  // two finishes, no roles: fronts + box in the first, the second on what's left
  assert.deepEqual(say('walnut and white').finishes, { fronts: 'walnut', cabinet: 'paint-white' });
});

test('the chips and the summary read back what was heard', () => {
  const i = say('a 60 inch floating double vanity in white oak with shadow fronts');
  assert.deepEqual(i.heard.map((h) => h.label), ['Bathroom vanity', '60" wide', 'Double sink', 'Floating', 'Shadow', 'White oak']);
  assert.equal(i.summary, 'A 60" double vanity · floating · shadow · white oak');
  assert.equal(say('hmm').summary, '');
});

test('what it hears always plans', () => {
  const sentences = [
    'a floating walnut double vanity, about five feet', 'single sink vanity, 84 inches', 'mid-century walnut credenza 6 feet',
    'floating media console', 'a white oak dresser with equal drawers on a toe kick', 'built-in bookshelves with shadow fronts',
    'standing desk for my office, no handles', 'coffee bar for the café, 8 feet', 'kitchen island, charcoal, 7 foot',
    'a floating dresser', 'double vanity on a 48 inch wall',
  ];
  for (const text of sentences) {
    const i = say(text);
    assert.ok(i.project, text);
    const p = plan({ project: i.project, wallLength: 120 * IN, wallHeight: 96 * IN, width: i.width, sinks: i.sinks, mounting: i.mounting,
      style: { ...i.style, ...(i.finishes.fronts ? { frontFinish: i.finishes.fronts } : {}) } });
    assert.ok(p.width > 0, text);
    if (i.mounting && (i.project === 'vanity' || i.project === 'console' || i.project === 'dresser')) assert.equal(p.spec.mounting, i.mounting, text);
  }
});

test('one sink on a wide wall: a centred sink between two drawer banks, capped at 72"', () => {
  const p = plan({ project: 'vanity', wallLength: 120 * IN, sinks: 1 });
  assert.equal(p.sinks, 1);
  assert.equal(Math.round(p.width / IN), 72);
  assert.deepEqual(p.spec.sinks?.map((s) => s.cabinet), ['B']);
  const [a, b, c] = p.spec.cabinets.map((x) => x.width as number);
  assert.equal(a, c);
  assert.ok(Math.abs(b / a - 1.618) < 0.05, `sink ${b / IN}" vs banks ${a / IN}"`);
  assert.ok(p.notes.some((n) => /72"/.test(n)));
  const two = plan({ project: 'vanity', wallLength: 50 * IN, sinks: 2 });
  assert.equal(two.sinks, 1);
  assert.ok(two.notes.some((n) => /double vanity needs 60"/.test(n)));
});
