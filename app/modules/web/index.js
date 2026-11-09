// Jera's page module: its access hatches on the web. Written by `exact hatch`; yours from here.
// A hatch is handed the DOM element Exact built, configures it, and changes Contract state only by acting on
// authored nodes: e.click(), e.focus(), e.blur(), e.input(text). The app works without it (?hatches=off on a
// development page). `perf hatches`, `state` and `logs` show what each one did.
const hatches = {};
import * as daoPanelHatch from './hatch-dao-panel.js';
hatches["dao-panel"] = daoPanelHatch;
// exact:hatches (exact hatch adds a word's line above this one)

export function element(e) { hatches[e.hatch]?.element?.(e); }
export function elementEnded(e) { hatches[e.hatch]?.elementEnded?.(e); }

export function appEnded() { daoPanelHatch.appEnded(); }
