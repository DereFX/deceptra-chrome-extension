const ALLOWED_TYPES = ["prechecked_opt_in","confirmshaming","forced_continuity","hidden_fee","trick_question","visual_interference","forced_action","urgency","scarcity","social_proof"];

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!process.env.OPENAI_API_KEY) return res.status(503).json({ error: "AI analysis is not configured" });
  const origin = req.headers.origin || "";
  if (process.env.ALLOWED_EXTENSION_ORIGIN && origin !== process.env.ALLOWED_EXTENSION_ORIGIN) return res.status(403).json({ error: "Origin not allowed" });

  const snapshot = sanitizeSnapshot(req.body?.snapshot);
  if (!snapshot) return res.status(400).json({ error: "Invalid snapshot" });

  const schema = { type:"object", additionalProperties:false, required:["findings"], properties:{ findings:{ type:"array", maxItems:12, items:{ type:"object", additionalProperties:false, required:["id","type","title","severity","confidence","evidence","explanation"], properties:{ id:{type:"string"}, type:{type:"string",enum:ALLOWED_TYPES}, title:{type:"string"}, severity:{type:"string",enum:["low","medium","high"]}, confidence:{type:"number",minimum:0,maximum:1}, evidence:{type:"string"}, explanation:{type:"string"} } } } } };
  const prompt = `Analyze this sanitized checkout/consent UI snapshot for deceptive design. Be conservative: flag only evidence-supported manipulation, not ordinary marketing. Explain the user impact plainly. Structural facts in the JSON are reliable; never infer a checked state that is absent.\n\n${JSON.stringify(snapshot)}`;
  const response = await fetch("https://api.openai.com/v1/responses", { method:"POST", headers:{ authorization:`Bearer ${process.env.OPENAI_API_KEY}`, "content-type":"application/json" }, body:JSON.stringify({ model:process.env.OPENAI_MODEL || "gpt-5.6-luna", reasoning:{effort:"low"}, input:[{role:"system",content:"You are a conservative deceptive-interface auditor. Return only the requested JSON."},{role:"user",content:prompt}], text:{format:{type:"json_schema",name:"deceptra_findings",strict:true,schema}} }) });
  if (!response.ok) return res.status(502).json({ error:"Model request failed" });
  const data = await response.json();
  const outputText = (data.output || []).flatMap((item) => item.content || []).find((item) => item.type === "output_text")?.text;
  if (!outputText) return res.status(502).json({ error:"Model returned no structured output" });
  const parsed = JSON.parse(outputText);
  res.setHeader("cache-control", "no-store");
  return res.status(200).json({ findings: parsed.findings || [] });
}

function sanitizeSnapshot(value) {
  if (!value || typeof value !== "object") return null;
  const clip = (text, max=500) => String(text || "").replace(/\s+/g," ").trim().slice(0,max);
  return { url:clip(value.url,300), title:clip(value.title,200), checkboxes:(value.checkboxes||[]).slice(0,60).map((x)=>({checked:Boolean(x.checked),defaultChecked:Boolean(x.defaultChecked),required:Boolean(x.required),context:clip(x.context)})), buttons:(value.buttons||[]).slice(0,100).map((x)=>({text:clip(x.text,160),area:Number(x.area)||0,prominence:Number(x.prominence)||0,group:clip(x.group,150)})), textBlocks:(value.textBlocks||[]).slice(0,160).map((x)=>({text:clip(x.text,600)})) };
}
