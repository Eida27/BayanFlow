# BayanFlow

BayanFlow is a hackathon prototype for a fictional municipal Business Permit Request. Residents submit sample PDFs, receive an AI completeness check, correct their submission after staff feedback, and pay a simulated 0.001 tBNB fee on BSC Testnet. The receipt links to the public transaction.

## Start locally

Use Node.js 24, pnpm 11.25, and Docker Compose. For the live AI and payment steps, use an OpenAI API key and a MetaMask wallet funded with testnet tBNB.

1. Run `pnpm install --frozen-lockfile`.
2. Copy `.env.example` to `.env` and set `OPENAI_API_KEY` for the AI demo. You can configure another compatible OpenAI model with `OPENAI_MODEL`.
3. Start PostgreSQL with `docker compose up -d --wait`, then run `pnpm db:setup`.
4. Run `pnpm dev` and open [BayanFlow](http://localhost:3000). The development command starts Next.js and the Express API.

| Role | Email | Password |
| --- | --- | --- |
| Resident | resident@bayanflow.test | resident-demo |
| Staff | staff@bayanflow.test | staff-demo |

Use separate browser profiles for resident and staff. Only upload fictional material. The sample PDFs are bundled under `public/samples` and linked from the app. Express keeps uploaded files private and stores them in PostgreSQL. AI receives extracted text, and staff can proceed manually when extraction or AI is unavailable. `docker compose down` stops the database and retains the volume.

## Configure BSC Testnet

Follow the [contract setup and verification guide](contracts/README.md). Set `PAYMENT_CONTRACT_ADDRESS` and `PAYMENT_SIGNER_PRIVATE_KEY` in the root `.env` and restart the API. Use the key for the contract's configured **authorization signer**, ideally separate from the deployer and demo treasury. Configure MetaMask for chain 97 and fund the resident demo wallet with enough testnet tBNB for the fee and gas. The first payment authorization binds the application to that wallet. Authorization can be renewed for the same wallet.

## Rehearse the demo

1. Sign in as the resident and submit **Paper Lantern Stationery** with the incomplete premises declaration and the other two sample PDFs.
2. Show the AI finding for the missing intended use. As staff, open the submission, review the PDF, and request a correction.
3. As the resident, resubmit with the complete declaration. As staff, approve the revised submission.
4. Connect MetaMask, confirm the testnet payment, and open the receipt. If you reload before confirmation, use the payment recovery control. The API can look up a recent matching on-chain payment by reference. The wallet's activity provides the transaction hash for older payments.
5. Open the transaction in Testnet BscScan. Add that transaction link and the verified contract address to the pitch deck before presenting.

## Checks

- `pnpm test` exercises the fictional checklist, PDF fixtures, and staff transitions.
- `pnpm test:integration` uses PostgreSQL and a simulated chain gateway. Set `TEST_DATABASE_URL` to a disposable database with schema creation privileges. The test creates and drops an isolated schema.
- `pnpm build` builds the Next.js app.
- See the [contract guide](contracts/README.md) for contract tests and testnet deployment.

The API and Next.js development server bind to loopback. The seeded accounts and local database credentials are for the hackathon demo.
