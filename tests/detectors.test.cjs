const test = require("node:test");
const assert = require("node:assert/strict");
let detectors;

test.before(async () => {
  await import("../core/detectors.js");
  detectors = globalThis.DeceptraDetectors;
});

function types(snapshot) { return detectors.analyzeSnapshot(snapshot).map((x) => x.type); }

test("detects an optional prechecked marketing opt-in", () => {
  assert(types({ checkboxes:[{checked:true,defaultChecked:true,required:false,context:"Send me marketing and partner offers",selector:"#offers"}],textBlocks:[],buttons:[] }).includes("prechecked_opt_in"));
});

test("does not flag a required terms checkbox as marketing", () => {
  assert(!types({ checkboxes:[{checked:true,defaultChecked:true,required:true,context:"I accept the terms of service",selector:"#terms"}],textBlocks:[],buttons:[] }).includes("prechecked_opt_in"));
});

test("detects confirmshaming and forced continuity", () => {
  const result=types({checkboxes:[],buttons:[],textBlocks:[{text:"No thanks, I prefer paying full price"},{text:"Free for 7 days then renews automatically at $19.99 per month unless you cancel"}]});
  assert(result.includes("confirmshaming")); assert(result.includes("forced_continuity"));
});

test("detects late mandatory fees", () => {
  assert(types({checkboxes:[],buttons:[],textBlocks:[{text:"A mandatory platform fee is calculated at the final step"}]}).includes("hidden_fee"));
});

test("detects unequal button hierarchy only within the same group", () => {
  const result=types({checkboxes:[],textBlocks:[],buttons:[{text:"Accept all",group:"#dialog",area:5000,prominence:6,selector:"#yes"},{text:"Necessary only",group:"#dialog",area:1500,prominence:3,selector:"#no"}]});
  assert(result.includes("visual_interference"));
});

test("clean copy stays clean", () => {
  assert.equal(types({checkboxes:[{checked:false,defaultChecked:false,required:false,context:"Optional product updates"}],buttons:[],textBlocks:[{text:"One-time total $29 including all mandatory fees"}]}).length,0);
});
