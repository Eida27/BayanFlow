import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import solc from "solc";

const require = createRequire(import.meta.url);
const sourceName = "BayanFlow.sol";
const contractName = "BayanFlow";

export function compile() {
  const sources = {
    [sourceName]: {
      content: readFileSync(new URL("../BayanFlow.sol", import.meta.url), "utf8"),
    },
  };
  const input = {
    language: "Solidity",
    sources,
    settings: {
      evmVersion: "shanghai",
      optimizer: { enabled: true, runs: 200 },
      outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } },
    },
  };
  const output = JSON.parse(solc.compile(JSON.stringify(input), {
    import(path) {
      if (!path.startsWith("@openzeppelin/contracts/")) return { error: "Unsupported import" };
      const content = readFileSync(require.resolve(path), "utf8");
      sources[path] = { content };
      return { contents: content };
    },
  }));
  const errors = output.errors?.filter(({ severity }) => severity === "error") ?? [];
  if (errors.length) throw new Error(errors.map(({ formattedMessage }) => formattedMessage).join("\n"));

  const compiled = output.contracts[sourceName][contractName];
  return {
    abi: compiled.abi,
    bytecode: "0x" + compiled.evm.bytecode.object,
    compilerVersion: solc.version(),
    fullyQualifiedName: sourceName + ":" + contractName,
    standardInput: input,
  };
}
