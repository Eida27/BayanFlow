# BayanFlow contract

BayanFlow accepts one payment of 0.001 tBNB per reference. The authorized signer issues an EIP-712 signature for the payer, reference, fixed amount, and Unix timestamp deadline. The contract forwards the full payment to the configured treasury in the same transaction and emits `PaymentReceived(bytes32 indexed referenceId, address indexed payer, uint256 amount)`. If the treasury rejects the transfer, the payment and the reference update both revert.

## Build and test

Run these commands from this directory with Node.js 22 or newer.

```sh
npm ci
npm test
npm run build
```

The tests use an in-process Hardhat chain with chain ID 97 and require no wallet funding. The build writes the ABI and bytecode to `artifacts/BayanFlow.json` and the explorer verification input to `artifacts/BayanFlow.standard-input.json`.

## Deploy and verify on BNB Smart Chain Testnet

1. Copy `.env.example` to `.env` in this directory. Set the private key of a funded testnet deployer, the address derived from the backend payment-signing key, and a treasury address that can receive native tBNB. The constructor fixes the signer and treasury for the life of the deployment.
2. Run `npm run deploy:bsc-testnet`. The command checks the RPC chain ID before broadcasting. Save the transaction hash, contract address, and deployment block printed by the command. Set the resulting contract address in the app configuration.
3. Run `npm run build`, then open the new contract's page on [BscScan Testnet](https://testnet.bscscan.com/). On the Contract tab, choose **Verify and Publish**, select **Solidity (Standard-Json-Input)**, and select **v0.8.28+commit.7893614a**. Upload `artifacts/BayanFlow.standard-input.json`, use `BayanFlow.sol:BayanFlow` if prompted for the contract name, and supply the printed `constructorArguments` if requested.
4. Confirm the explorer displays the verified source at the deployed address. Retain the deployment transaction link and verified contract link for the submission.

## Authorization format

The typed-data domain is `{ name: "BayanFlow", version: "1", chainId: 97, verifyingContract }`. The primary type is `Payment(bytes32 referenceId,address payer,uint256 amount,uint256 deadline)`. The amount is `1000000000000000` wei. The payer submits `pay(referenceId, deadline, signature)` from the authorized address with that exact transaction value.
