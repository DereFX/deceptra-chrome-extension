"use strict";
const DEFAULTS={enabled:true,showPageBadge:true,aiEnabled:false,apiEndpoint:"",minimumSeverity:"low"};
const ids=Object.keys(DEFAULTS);
chrome.storage.sync.get(DEFAULTS).then((values)=>{for(const id of ids){const el=document.getElementById(id);if(el.type==="checkbox")el.checked=Boolean(values[id]);else el.value=values[id]||"";}});
document.getElementById("save").addEventListener("click",async()=>{const values={};for(const id of ids){const el=document.getElementById(id);values[id]=el.type==="checkbox"?el.checked:el.value.trim();}if(values.aiEnabled&&!/^https:\/\//.test(values.apiEndpoint)){document.getElementById("status").textContent="Use an HTTPS endpoint.";return;}await chrome.storage.sync.set(values);document.getElementById("status").textContent="Saved.";setTimeout(()=>document.getElementById("status").textContent="",1800);});
