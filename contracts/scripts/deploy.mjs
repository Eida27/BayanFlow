import { AbiCoder, ContractFactory, JsonRpcProvider, Wallet, ZeroAddress, getAddress } from "ethers";
import { compile } from "./compile.mjs";

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(name + " is required");
  return value;
}

function nonzeroAddress(name) {
  const value = getAddress(required(name));
  if (value === ZeroAddress) throw new Error(name + " must be nonzero");
  return value;
}

async function deploy() {
  const rpc = required("BSC_TESTNET_RPC_URL");
  const privateKey = required("DEPLOYER_PRIVATE_KEY");
  const signer = nonzeroAddress("PAYMENT_SIGNER_ADDRESS");
  const treasury = nonzeroAddress("TREASURY_ADDRESS");
  const provider = new JsonRpcProvider(rpc);
  const { chainId } = await provider.getNetwork();
  if (chainId !== 97n) throw new Error("Deployment requires BNB Smart Chain Testnet (chain ID 97)");

  const { abi, bytecode, compilerVersion, fullyQualifiedName } = compile();
  const deployer = new Wallet(privateKey, provider);
  const contract = await new ContractFactory(abi, bytecode, deployer).deploy(signer, treasury);
  const deployment = contract.deploymentTransaction();
  console.log("Deployment transaction " + deployment.hash);
  const receipt = await deployment.wait();
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  const constructorArguments = AbiCoder.defaultAbiCoder().encode(["address", "address"], [signer, treasury]);
  console.log(JSON.stringify({
    chainId: Number(chainId),
    contractAddress: address,
    transactionHash: deployment.hash,
    deploymentBlock: receipt.blockNumber,
    signer,
    treasury,
    compilerVersion,
    fullyQualifiedName,
    constructorArguments: constructorArguments.slice(2),
    explorer: "https://testnet.bscscan.com/address/" + address,
  }, null, 2));
}

deploy().catch((error) => {
  console.error(error.shortMessage ?? error.message);
  process.exitCode = 1;
});
