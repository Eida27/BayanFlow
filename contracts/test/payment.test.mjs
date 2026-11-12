import assert from "node:assert/strict";
import { before, test } from "node:test";
import { BrowserProvider, ContractFactory, Wallet, id } from "ethers";
import hardhat from "hardhat";
import { compile } from "../scripts/compile.mjs";

const amount = 1_000_000_000_000_000n;
const types = {
  Payment: [
    { name: "referenceId", type: "bytes32" },
    { name: "payer", type: "address" },
    { name: "amount", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
};

const provider = new BrowserProvider(hardhat.network.provider);
const signer = Wallet.createRandom();
let payer;
let otherPayer;
let treasury;
let contract;
let domain;

before(async () => {
  const { abi, bytecode } = compile();
  payer = await provider.getSigner(0);
  otherPayer = await provider.getSigner(1);
  treasury = await provider.getSigner(2);
  const factory = new ContractFactory(abi, bytecode, payer);
  contract = await factory.deploy(signer.address, treasury.address);
  await contract.waitForDeployment();
  domain = {
    name: "BayanFlow",
    version: "1",
    chainId: 97,
    verifyingContract: await contract.getAddress(),
  };
});

async function authorization(label, fields = {}, domainOverrides = {}, authorizer = signer) {
  const latest = await provider.getBlock("latest");
  const payment = {
    referenceId: id(label),
    payer: payer.address,
    amount,
    deadline: latest.timestamp + 300,
    ...fields,
  };
  const signature = await authorizer.signTypedData({ ...domain, ...domainOverrides }, types, payment);
  return { ...payment, signature };
}

test("forwards exactly 0.001 tBNB and records the payer and reference", async () => {
  const { referenceId, deadline, signature } = await authorization("valid payment");
  const initialBalance = BigInt(await provider.send("eth_getBalance", [treasury.address, "latest"]));
  const receipt = await (await contract.pay(referenceId, deadline, signature, { value: amount })).wait();

  assert.equal(receipt.logs.length, 1);
  const event = contract.interface.parseLog(receipt.logs[0]);
  assert.equal(event.name, "PaymentReceived");
  assert.deepEqual(Array.from(event.args), [referenceId, payer.address, amount]);
  assert.equal(receipt.logs[0].topics.length, 3);
  assert.equal(
    BigInt(await provider.send("eth_getBalance", [treasury.address, "latest"])),
    initialBalance + amount,
  );
  assert.equal(BigInt(await provider.send("eth_getBalance", [await contract.getAddress(), "latest"])), 0n);
});

const hasError = (name) => (error) => error.revert?.name === name;

test("rejects a second authorization for a previously paid reference", async () => {
  const { referenceId, deadline, signature } = await authorization("duplicate payment");
  await (await contract.pay(referenceId, deadline, signature, { value: amount })).wait();
  const second = await authorization("duplicate payment", { payer: otherPayer.address });
  await assert.rejects(
    contract.connect(otherPayer).pay.staticCall(referenceId, second.deadline, second.signature, { value: amount }),
    hasError("ReferenceAlreadyPaid"),
  );
});

test("rejects an authorization signed for a different payer", async () => {
  const { referenceId, deadline, signature } = await authorization("payer binding");
  await assert.rejects(
    contract.connect(otherPayer).pay.staticCall(referenceId, deadline, signature, { value: amount }),
    hasError("InvalidAuthorization"),
  );
});

test("rejects a signed amount below the fixed fee", async () => {
  const wrongAmount = amount - 1n;
  const { referenceId, deadline, signature } = await authorization("fee binding", { amount: wrongAmount });
  await assert.rejects(
    contract.pay.staticCall(referenceId, deadline, signature, { value: wrongAmount }),
    hasError("IncorrectAmount"),
  );
});

test("rejects an expired authorization", async () => {
  const { referenceId, deadline, signature } = await authorization("expired payment", { deadline: 1 });
  await assert.rejects(
    contract.pay.staticCall(referenceId, deadline, signature, { value: amount }),
    hasError("AuthorizationExpired"),
  );
});

test("rejects an authorization signed for a different chain", async () => {
  const { referenceId, deadline, signature } = await authorization("chain binding", {}, { chainId: 56 });
  await assert.rejects(
    contract.pay.staticCall(referenceId, deadline, signature, { value: amount }),
    hasError("InvalidAuthorization"),
  );
});

test("rejects an authorization signed for a different contract", async () => {
  const { referenceId, deadline, signature } = await authorization(
    "contract binding", {}, { verifyingContract: otherPayer.address },
  );
  await assert.rejects(
    contract.pay.staticCall(referenceId, deadline, signature, { value: amount }),
    hasError("InvalidAuthorization"),
  );
});

test("rejects signatures from another signer", async () => {
  const { referenceId, deadline, signature } = await authorization(
    "signer binding", {}, {}, Wallet.createRandom(),
  );
  await assert.rejects(
    contract.pay.staticCall(referenceId, deadline, signature, { value: amount }),
    hasError("InvalidAuthorization"),
  );
});
