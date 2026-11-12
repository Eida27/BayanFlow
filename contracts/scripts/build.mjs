import { mkdirSync, writeFileSync } from "node:fs";
import { compile } from "./compile.mjs";

const compiled = compile();
const directory = new URL("../artifacts/", import.meta.url);
mkdirSync(directory, { recursive: true });

const { standardInput, ...artifact } = compiled;
writeFileSync(new URL("BayanFlow.json", directory), JSON.stringify(artifact, null, 2) + "\n");
writeFileSync(new URL("BayanFlow.standard-input.json", directory), JSON.stringify(standardInput, null, 2) + "\n");
console.log("Compiled BayanFlow with Solidity " + compiled.compilerVersion);
