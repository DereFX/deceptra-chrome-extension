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
  const result=types({checkboxes:[],buttons:[],textBlocks:[{text:"No thanks, I prefer paying full price",inFlow:true},{text:"Free for 7 days then renews automatically at $19.99 per month unless you cancel"}]});
  assert(result.includes("confirmshaming")); assert(result.includes("forced_continuity"));
});

test("detects late mandatory fees", () => {
  assert(types({checkboxes:[],buttons:[],textBlocks:[{text:"A mandatory platform fee is calculated at the final step"}]}).includes("hidden_fee"));
});

test("detects unequal button hierarchy only within the same group", () => {
  const result=types({checkboxes:[],textBlocks:[],buttons:[{text:"Accept all",group:"#dialog",area:5000,prominence:6,selector:"#yes",inFlow:true},{text:"Necessary only",group:"#dialog",area:1500,prominence:3,selector:"#no",inFlow:true}]});
  assert(result.includes("visual_interference"));
});

test("clean copy stays clean", () => {
  assert.equal(types({checkboxes:[{checked:false,defaultChecked:false,required:false,context:"Optional product updates"}],buttons:[],textBlocks:[{text:"One-time total $29 including all mandatory fees"}]}).length,0);
});

test("ignores YouTube-style media timestamps", () => {
  const timestamps = ["1:48", "12:25", "1:40", "3:20", "5:51"].map((text) => ({ text, inFlow: false }));
  assert.equal(types({ checkboxes: [], buttons: [], textBlocks: timestamps }).length, 0);
});

test("detects a contextual checkout deadline but not an isolated clock", () => {
  const result = types({ checkboxes: [], buttons: [], textBlocks: [
    { text: "Complete your order within 02:00 to keep this price", inFlow: true },
    { text: "12:25", inFlow: false }
  ] });
  assert.deepEqual(result, ["urgency"]);
});

test("does not compare generic social-media buttons as a consent hierarchy", () => {
  const result = types({ checkboxes: [], textBlocks: [], buttons: [
    { text: "Continue", group: "#feed", area: 5000, prominence: 6, selector: "#continue", inFlow: false },
    { text: "Not now", group: "#feed", area: 1000, prominence: 2, selector: "#later", inFlow: false }
  ] });
  assert(!result.includes("visual_interference"));
});

test("collapses nested duplicate findings", () => {
  const result = detectors.analyzeSnapshot({ checkboxes: [], buttons: [], textBlocks: [
    { text: "Offer expires today", inFlow: true },
    { text: "Special checkout banner: Offer expires today", inFlow: true }
  ] });
  assert.equal(result.filter((item) => item.type === "urgency").length, 1);
});
