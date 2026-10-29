# Validation results

Validated October 29, 2026 (America/Chicago).

## Automated execution

Command: `npm test`

- Solidity compiler: 0.8.34.
- Optimizer: enabled, 200 runs.
- EVM target and local execution hardfork: Shanghai.
- Compilation: no warnings or errors in the source or test helper.
- Result: **14 tests passed, 0 failed, 0 skipped**.

The test runner executed actual compiled contract bytecode on an in-memory Ganache blockchain. The test helper models a contract owner that rejects ETH or attempts to withdraw again during its payment callback.

Verified behaviors:

1. Constructor initializes ownership and all business state.
2. Constructor rejects empty property names and zero rent.
3. Exact-fee rental records the tenant, payment, and event.
4. Underpayment, overpayment, and owner self-rental are rejected.
5. An active rental cannot be overwritten, repriced, or transferred.
6. Only the tenant can check out; checkout preserves the earned fee.
7. Price changes take effect for subsequent rentals.
8. Nonowners cannot change rent, withdraw, or transfer ownership.
9. Zero rent, empty withdrawals, and invalid new owners are rejected.
10. Withdrawal pays the owner once and preserves an active rental.
11. Multiple rentals accumulate fees; outstanding earnings block transfer.
12. Transfer updates ownership, access rights, and event addresses.
13. A failed ETH payment restores accounting and preserves funds.
14. A payment callback cannot withdraw the same earnings twice.

The local Node runtime used JavaScript fallbacks for optional Ganache native bindings. This did not affect the passing results.

## Remix verification

- Imported the unchanged `PropertyRental.sol` file into Remix at `https://app.remix.live`.
- Successfully compiled using Solidity 0.8.34.
- Successfully deployed to **Remix VM / Osaka**, using its simulated Account 1.
- Constructor values: `Campus Guest House`, `10000000000000000` wei.
- Remix displayed the deployed `PropertyRental` instance and its interaction functions.

The Remix deployment and the automated Shanghai execution are separate checks. No real funds or public blockchain were used.

## Submission status

The Solidity contract is published at https://github.com/DesolaH/isds4111-smart-contract. The repository is public, so the source can be viewed without a GitHub login. The repository link must still be submitted through Moodle; Moodle submission has not been performed.
