# BayanFlow

BayanFlow is a hackathon prototype for fictional municipal services. Residents can request a Business Permit, Mayor’s Clearance / Certification, or Zoning / Locational Clearance. They can submit sample PDFs, see document completeness findings, and correct their submission after staff feedback. Approved applications use a simulated 0.001 tBNB fee on BSC Testnet. The public receipt links to the transaction, and a paid clearance request includes a private demo certificate.

## Project layout

- `frontend/` contains the Next.js app and public assets.
- `backend/` contains the Express API, business logic, and database setup command.
- `database/schema.sql` defines the PostgreSQL schema.
- `contracts/` contains the Solidity contract, tests, and deployment scripts.

Run the application commands from the repository root.

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

Use separate browser profiles for resident and staff. Only upload fictional material. The sample PDFs are bundled under `frontend/public/samples` and linked from the app. Express keeps uploaded files private and stores them in PostgreSQL. AI receives extracted text, and staff can proceed manually when extraction or AI is unavailable. `docker compose down` stops the database and retains the volume.

## Configure BSC Testnet

Follow the [contract setup and verification guide](contracts/README.md). Set `PAYMENT_CONTRACT_ADDRESS` and `PAYMENT_SIGNER_PRIVATE_KEY` in the root `.env` and restart the API. Use the key for the contract's configured **authorization signer**, ideally separate from the deployer and demo treasury. Configure MetaMask for chain 97 and fund the resident demo wallet with enough testnet tBNB for the fee and gas. The first payment authorization binds the application to that wallet. Authorization can be renewed for the same wallet.

## Rehearse the demo

Run `pnpm db:setup` after updating an existing checkout to add the latest services while preserving applications and receipts.

### Tricycle Operator’s Permit

1. As the resident, select **Tricycle Operator’s Permit**. Enter **Alex Sample**, **DEMO-TRI-042**, and **Market Loop**. Attach the mismatched vehicle registration sample and the operator record. The AI checklist should flag the different unit ID, **DEMO-TRI-099**.
2. In a separate browser profile, sign in as staff, compare the PDFs with the form, and request corrections with a note.
3. As the resident, resubmit with the matching vehicle registration and the same operator record. As staff, review the corrected revision and approve it.
4. As the resident, pay **0.001 tBNB** with the funded testnet wallet. After verification, open the public receipt and download the private demo permit.

The demo uses fictional records and follows the broad review, payment, and release sequence in [Mauban’s published Citizen’s Charter](https://mauban.gov.ph/wp-content/uploads/2025/03/Mauban_CitizensCharter_2024_1stEdition.pdf).

### Zoning / Locational Clearance

1. As the resident, start a **Zoning / Locational Clearance** application for **Paper Lantern Reading Room** at **25 Example Avenue, Demo Town**, with proposed use **Operate a community reading room.**
2. Attach the incomplete site information sheet and incomplete land-use declaration. Leave ownership or owner authorization empty and submit. The checklist flags the absent ownership PDF. With AI configured, it also flags the missing lot area and proposed activity in the attached PDFs.
3. In a separate browser profile, sign in as staff. Review the findings and attached PDFs, then request corrections with a note. Approval requires all three PDFs in the current revision.
4. As the resident, refresh and resubmit using all three complete samples. As staff, review the new revision and approve it. As the resident, refresh, pay with the funded BSC Testnet wallet, then open the public receipt and download the private demo zoning clearance.

### Mayor’s Clearance / Certification

1. As the resident, open **New application** and choose **Mayor’s Clearance / Certification**. Enter **Alex Sample**, **10 Example Lane, Demo Town**, and **Volunteer application for the Demo Town Reading Program**. Download and attach the supporting sample PDF.
2. In a separate browser profile, sign in as staff. Open the request in the shared queue, review the supporting PDF and any advisory findings, and approve it with a note.
3. Return to the resident account, refresh, and pay with the funded BSC Testnet wallet configured above. Once payment is verified, open the public receipt and download the demo clearance PDF from the application.

Run `pnpm db:setup` after updating an existing BayanFlow checkout to add the new service fields and document type. The setup preserves existing applications and receipts.

### Business Permit

1. Sign in as the resident and submit **Paper Lantern Stationery** with the incomplete premises declaration and the other two sample PDFs.
2. Show the AI finding for the missing intended use. As staff, open the submission, review the PDF, and request a correction.
3. As the resident, resubmit with the complete declaration. As staff, approve the revised submission.
4. Connect MetaMask, confirm the testnet payment, and open the receipt. If you reload before confirmation, use the payment recovery control. The API can look up a recent matching on-chain payment by reference. The wallet's activity provides the transaction hash for older payments.
5. Open the transaction in Testnet BscScan. Add that transaction link and the verified contract address to the pitch deck before presenting.

## Verify an issued demo document

After confirming payment, download the demo PDF from the resident application. All four services include a verification QR code, including previously paid applications when you download the PDF again. Compare the verification ID, service, and issue date with the public page. Use its BscScan Testnet link to inspect the recorded payment.

For phone scans, set `PUBLIC_WEB_ORIGIN` in the root `.env` to the frontend origin reachable from the phone, such as `http://192.168.1.20:3000` with your computer's actual LAN address or the HTTPS origin of a hosted demo. Restart the API and download a fresh PDF. To test over Wi-Fi, use two terminals and run `pnpm api` and `pnpm exec next dev frontend --hostname 0.0.0.0` on a trusted network. The phone can scan and verify without signing in. Use localhost on the computer to sign in and download the PDF.

## Resident activity

Run `pnpm db:setup` before starting the updated API. The resident portal records new application activity from that point forward. Open an application to see its timeline, or use **Notifications** to find staff decisions and newly issued demo documents.

## Checks

- `pnpm test` exercises the fictional checklist, PDF fixtures, and staff transitions.
- `pnpm test:integration` uses PostgreSQL and a simulated chain gateway. Set `TEST_DATABASE_URL` to a disposable database with schema creation privileges. The test creates and drops an isolated schema.
- `pnpm build` builds the Next.js app.
- See the [contract guide](contracts/README.md) for contract tests and testnet deployment.

The API and Next.js development server bind to loopback. The seeded accounts and local database credentials are for the hackathon demo.
