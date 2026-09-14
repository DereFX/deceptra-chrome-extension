import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { platform } from "node:os";
import { promisify } from "node:util";

const exec = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const stage = resolve(root, "dist");
await rm(stage,{recursive:true,force:true}); await mkdir(stage,{recursive:true});
for(const item of ["manifest.json","background.js","core","content","popup","options"]){await cp(resolve(root,item),resolve(stage,item),{recursive:true});}
const zip=resolve(root,"deceptra-extension-v0.1.1.zip");
await rm(zip,{force:true});
if (platform() === "win32") {
  await exec("tar.exe", ["-a", "-c", "-f", zip, "-C", stage, "."]);
} else {
  await exec("zip", ["-qr", zip, "."], { cwd: stage });
}
console.log(zip);
