# ISDS 4111: Smart Contract Assignment

**Business case:** a property owner offers one property for rent at a flat fee. A tenant pays the exact fee to begin the rental and checks out when finished. The owner collects the earned rent and can update the price between rentals or transfer control of the contract to a new owner.

**Assignment due date:** November 10, 2026.

**Repository to submit through Moodle:** https://github.com/DesolaH/isds4111-smart-contract

## Main file

[`PropertyRental.sol`](PropertyRental.sol) is the complete, self-contained Solidity contract. It has no library imports and can be compiled directly in Remix.

## Assignment rubric checklist

| Requirement | Points | Implementation in `PropertyRental.sol` |
| --- | ---: | --- |
| Designate license and Solidity version | 5 | MIT SPDX identifier and `pragma solidity ^0.8.34;` at lines 1-2 |
| Designate contract owner | 5 | `address public owner`, set to the deploying account (`msg.sender`) in the constructor |
| At least two other appropriate state variables | 10 | `propertyName`, `rentAmount`, `tenant`, `isRented`, and `unwithdrawnRent` |
| Set appropriate initial conditions through a constructor | 10 | Validates a nonempty name and positive rent; initializes the owner, property name, fee, empty tenant, available status, and zero earned rent |
| At least three public interaction functions | 20 | Five explicitly public functions: `rentProperty`, `endRental`, `setRentAmount`, `withdrawRent`, and `transferOwnership` |
| Two or more modifiers | 15 | `onlyOwner`, `onlyTenant`, and `whenAvailable`, each applied to appropriate functions |
| One or more events | 15 | `PropertyRented`, `RentalEnded`, `RentAmountChanged`, `RentWithdrawn`, and `OwnershipTransferred`, emitted when the corresponding action succeeds |
| Function to transfer ownership | 20 | `transferOwnership(address newOwner)`, restricted to the current owner; rejects zero or unchanged addresses and requires checkout and withdrawal first |
| **Total** | **100** | All code requirements are represented |

The compiler-generated getters for the public state variables are additional read-only interactions; they are not needed to reach the minimum function count.

## How the contract works

| Function | Who can call it? | Result |
| --- | --- | --- |
| `rentProperty()` | Any account other than the owner, while available | Requires the exact fee in ETH, records the tenant, marks the property rented, and adds the fee to earned rent |
| `endRental()` | Current tenant | Clears the tenant and makes the property available again |
| `setRentAmount(newRentAmount)` | Owner, while available | Changes the flat fee; zero is rejected |
| `withdrawRent()` | Owner | Pays all recorded earned rent to the owner; resets the accounting before the ETH transfer |
| `transferOwnership(newOwner)` | Owner, while available and after earned rent is withdrawn | Changes the owner and the associated access rights |

The rental has a flat, nonrefundable fee and continues until the tenant checks out. It does not implement monthly billing, deposits, deadlines, or automatic eviction. Ownership transfer updates control of this contract, rather than a legal property deed.

All monetary constructor/function arguments are in **wei**. For the demonstration below, `10000000000000000` wei is `0.01` ETH.

## Use in Remix

1. Open [Remix IDE](https://app.remix.live).
2. In the File Explorer, use **Create > Upload files** to import `PropertyRental.sol`, or create a file with that name and paste the source.
3. Compile with Solidity **0.8.34**. For the same settings as the automated tests, enable the optimizer with **200** runs and set the EVM target to **Shanghai**. These settings are available in the Solidity Compiler panel.
4. Open **Deploy & Run Transactions** and choose **Remix VM**, the simulated blockchain with funded test accounts. Keep the deployment **Value at 0**.
5. Select **Account 1** as the owner and enter the constructor arguments:
   - `initialPropertyName`: `Campus Guest House`
   - `initialRentAmount`: `10000000000000000`
6. Click **Deploy**. The contract appears under **Deployed Contracts**.

The demonstration uses simulated ETH in Remix VM. No MetaMask wallet or public-network deployment is needed for this walkthrough.

## Demonstration sequence

The current Remix interface displays each function with a **Transact** or **Call** button. Set Value in the deployed contract's interaction panel before invoking payable functions, and return it to zero before nonpayable transactions.

1. As **Account 1**, call the getters. `owner` should match Account 1, `rentAmount` should be `10000000000000000`, `tenant` should be the zero address, `isRented` should be `false`, and `unwithdrawnRent` should be `0`.
2. Switch to **Account 2**. Set **Value to `0.01` with unit `ether`** (or `10000000000000000` with unit `wei`), then transact with `rentProperty()`. Confirm `tenant` is Account 2, `isRented` is `true`, and `unwithdrawnRent` is `10000000000000000`.
3. Set **Value back to `0`**. As Account 2, transact with `endRental()`. Confirm `isRented` is `false` and `tenant` is zero. Earned rent stays in the contract.
4. Switch to **Account 1**. Transact with `withdrawRent()`. Confirm `unwithdrawnRent` is `0` and the contract's displayed ETH balance is `0`.
5. Still as Account 1, transact with `setRentAmount(20000000000000000)`. Confirm the updated price using `rentAmount()`.
6. Copy **Account 3's full address**, switch back to **Account 1**, and enter that address in `transferOwnership`. Transact and confirm `owner()` now returns Account 3.
7. As the former owner, Account 1, try `setRentAmount(30000000000000000)` with Value 0. It should revert with `Only the owner can do this`. Switch to Account 3 and repeat; it should succeed.

Other expected failures: paying too little or too much, booking an already rented property, a non-tenant attempting checkout, a nonowner withdrawing rent, zero-address ownership transfer, transfer during an active rental, and transfer before earned rent has been withdrawn.

Successful state changes emit events, visible in the transaction details. Read-only getters do not create transactions or events.

## Automated validation

The included tests compile the actual source with `solc` 0.8.34 and execute it on an in-memory Ganache EVM targeting Shanghai. From this folder:

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm test
```

The tests cover initialization, input validation, payment amounts, repeated bookings, tenant and owner access, price changes, withdrawals, multiple rentals, ownership transfer, rejected ETH delivery, and withdrawal reentrancy. No live blockchain connection is used.

## Required submission steps

1. Create or select a GitHub repository for this assignment.
2. Upload **`PropertyRental.sol`**. Including this README is helpful; the assignment's required deliverable is the Solidity file in the repository.
3. Confirm that the professor can access the repository and open the `.sol` file. If the repository is private, arrange instructor access.
4. Submit the **GitHub repository link through Moodle** by November 10, 2026.

The written assignment does not require an ERC-20 token, a deployed network address, or a deployment screenshot. The source contract and repository link are the specified deliverables.

## References

- Course assignment: *Assignment_SmartContract_fall2026.pdf*, supplied with this task.
- [Solidity contracts: constructors, modifiers, events, and function visibility](https://docs.soliditylang.org/en/latest/contracts.html)
- [Solidity checks-effects-interactions guidance](https://docs.soliditylang.org/en/latest/security-considerations.html#use-the-checks-effects-interactions-pattern)
- [Remix deployment and environment documentation](https://remix-ide.readthedocs.io/en/latest/run.html)
