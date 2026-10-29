import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { test, before } from 'node:test';
import solc from 'solc';
import ganache from 'ganache';
import { BrowserProvider, ContractFactory, ZeroAddress, parseEther } from 'ethers';

const rent = parseEther('0.01');
let compiled;
let helperCompiled;

before(() => {
  const source = readFileSync(new URL('../PropertyRental.sol', import.meta.url), 'utf8');
  const helpers = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;
import "PropertyRental.sol";
contract OwnerReceiver {
    PropertyRental public rental;
    bool public rejectPayment;
    bool public tryReentry;
    bool public reentrySucceeded;
    uint256 public received;
    constructor() { rental = new PropertyRental("Test property", 0.01 ether); }
    function configure(bool reject_, bool reenter_) external {
        rejectPayment = reject_; tryReentry = reenter_;
    }
    function withdraw() external { rental.withdrawRent(); }
    receive() external payable {
        require(!rejectPayment, "Payment rejected");
        received += msg.value;
        if (tryReentry) {
            (reentrySucceeded, ) = address(rental).call(
                abi.encodeWithSignature("withdrawRent()")
            );
        }
    }
}`;
  const output = JSON.parse(solc.compile(JSON.stringify({
    language: 'Solidity',
    sources: { 'PropertyRental.sol': { content: source }, 'OwnerReceiver.sol': { content: helpers } },
    settings: {
      optimizer: { enabled: true, runs: 200 },
      evmVersion: 'shanghai',
      outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } },
    },
  })));
  assert.deepEqual(output.errors ?? [], [], 'Compilation must have no warnings or errors');
  compiled = output.contracts['PropertyRental.sol'].PropertyRental;
  helperCompiled = output.contracts['OwnerReceiver.sol'].OwnerReceiver;
  mkdirSync(new URL('../artifacts/', import.meta.url), { recursive: true });
  writeFileSync(new URL('../artifacts/PropertyRental.json', import.meta.url),
    JSON.stringify({ compiler: solc.version(), evmVersion: 'shanghai', ...compiled }, null, 2));
});

async function fixture(t) {
  const chain = ganache.provider({
    logging: { quiet: true },
    chain: { hardfork: 'shanghai' },
    wallet: { totalAccounts: 4 },
  });
  const provider = new BrowserProvider(chain);
  provider.pollingInterval = 10;
  t.after(async () => { provider.destroy(); await chain.disconnect(); });
  const owner = await provider.getSigner(0);
  const tenant = await provider.getSigner(1);
  const other = await provider.getSigner(2);
  const successor = await provider.getSigner(3);
  const factory = new ContractFactory(compiled.abi, compiled.evm.bytecode.object, owner);
  const rental = await factory.deploy('Campus Guest House', rent);
  await rental.waitForDeployment();
  return { chain, provider, owner, tenant, other, successor, factory, rental };
}

async function mined(transaction) { return (await transaction).wait(); }
function event(rental, receipt, name) {
  const found = receipt.logs.map(log => {
    try { return rental.interface.parseLog(log); } catch { return null; }
  }).find(log => log?.name === name);
  assert.ok(found, `Expected ${name} event`);
  return found.args;
}
async function balance(chain, address) {
  return BigInt(await chain.request({ method: 'eth_getBalance', params: [address, 'latest'] }));
}

test('constructor assigns the owner and initializes every business state variable', async t => {
  const { rental, owner } = await fixture(t);
  assert.equal(await rental.owner(), await owner.getAddress());
  assert.equal(await rental.propertyName(), 'Campus Guest House');
  assert.equal(await rental.rentAmount(), rent);
  assert.equal(await rental.tenant(), ZeroAddress);
  assert.equal(await rental.isRented(), false);
  assert.equal(await rental.unwithdrawnRent(), 0n);
});

test('constructor rejects an empty name and zero rent', async t => {
  const { factory } = await fixture(t);
  await assert.rejects(factory.deploy('', rent), /revert|Property name/);
  await assert.rejects(factory.deploy('House', 0), /revert|Rent must/);
});

test('renting records the tenant, holds the exact fee, and emits an event', async t => {
  const { rental, tenant, chain } = await fixture(t);
  const receipt = await mined(rental.connect(tenant).rentProperty({ value: rent }));
  assert.equal(await rental.tenant(), await tenant.getAddress());
  assert.equal(await rental.isRented(), true);
  assert.equal(await rental.unwithdrawnRent(), rent);
  assert.equal(await balance(chain, await rental.getAddress()), rent);
  const args = event(rental, receipt, 'PropertyRented');
  assert.equal(args.tenant, await tenant.getAddress());
  assert.equal(args.amount, rent);
});

test('renting rejects underpayment, overpayment, and an owner renting their property', async t => {
  const { rental, tenant } = await fixture(t);
  for (const value of [0n, rent - 1n, rent + 1n]) {
    await assert.rejects(rental.connect(tenant).rentProperty.staticCall({ value }), /exact rent/);
  }
  await assert.rejects(rental.rentProperty.staticCall({ value: rent }), /Owner cannot rent/);
  assert.equal(await rental.isRented(), false);
});

test('an active rental cannot be booked again, repriced, or transferred', async t => {
  const { rental, tenant, other, successor } = await fixture(t);
  await mined(rental.connect(tenant).rentProperty({ value: rent }));
  await assert.rejects(rental.connect(other).rentProperty.staticCall({ value: rent }), /already rented/);
  await assert.rejects(rental.setRentAmount.staticCall(rent * 2n), /already rented/);
  await assert.rejects(rental.transferOwnership.staticCall(await successor.getAddress()), /already rented/);
  assert.equal(await rental.tenant(), await tenant.getAddress());
});

test('only the current tenant can check out; checkout does not refund the fee', async t => {
  const { rental, tenant, other } = await fixture(t);
  await mined(rental.connect(tenant).rentProperty({ value: rent }));
  await assert.rejects(rental.endRental.staticCall(), /Only the current tenant/);
  await assert.rejects(rental.connect(other).endRental.staticCall(), /Only the current tenant/);
  const receipt = await mined(rental.connect(tenant).endRental());
  assert.equal(event(rental, receipt, 'RentalEnded').tenant, await tenant.getAddress());
  assert.equal(await rental.isRented(), false);
  assert.equal(await rental.tenant(), ZeroAddress);
  assert.equal(await rental.unwithdrawnRent(), rent);
  await assert.rejects(rental.connect(tenant).endRental.staticCall(), /Only the current tenant/);
});

test('owner can change the available property fee and the new fee applies', async t => {
  const { rental, tenant } = await fixture(t);
  const receipt = await mined(rental.setRentAmount(rent * 2n));
  const args = event(rental, receipt, 'RentAmountChanged');
  assert.equal(args.oldAmount, rent);
  assert.equal(args.newAmount, rent * 2n);
  assert.equal(await rental.rentAmount(), rent * 2n);
  await assert.rejects(rental.connect(tenant).rentProperty.staticCall({ value: rent }), /exact rent/);
  await mined(rental.connect(tenant).rentProperty({ value: rent * 2n }));
});

test('nonowners cannot change the fee, withdraw rent, or transfer ownership', async t => {
  const { rental, tenant, successor } = await fixture(t);
  await assert.rejects(rental.connect(tenant).setRentAmount.staticCall(rent * 2n), /Only the owner/);
  await assert.rejects(rental.connect(tenant).withdrawRent.staticCall(), /Only the owner/);
  await assert.rejects(rental.connect(tenant).transferOwnership.staticCall(await successor.getAddress()), /Only the owner/);
});

test('zero rent, empty withdrawals, and invalid ownership targets are rejected', async t => {
  const { rental, owner } = await fixture(t);
  await assert.rejects(rental.setRentAmount.staticCall(0), /greater than zero/);
  await assert.rejects(rental.withdrawRent.staticCall(), /No rent to withdraw/);
  await assert.rejects(rental.transferOwnership.staticCall(ZeroAddress), /zero address/);
  await assert.rejects(rental.transferOwnership.staticCall(await owner.getAddress()), /must be different/);
});

test('withdrawal pays the owner exactly once, less transaction gas, and leaves rental active', async t => {
  const { rental, tenant, owner, chain } = await fixture(t);
  await mined(rental.connect(tenant).rentProperty({ value: rent }));
  const before = await balance(chain, await owner.getAddress());
  const receipt = await mined(rental.withdrawRent());
  const after = await balance(chain, await owner.getAddress());
  assert.equal(after - before + receipt.fee, rent);
  assert.equal(await rental.unwithdrawnRent(), 0n);
  assert.equal(await balance(chain, await rental.getAddress()), 0n);
  assert.equal(await rental.isRented(), true);
  const args = event(rental, receipt, 'RentWithdrawn');
  assert.equal(args.owner, await owner.getAddress());
  assert.equal(args.amount, rent);
  await assert.rejects(rental.withdrawRent.staticCall(), /No rent to withdraw/);
});

test('multiple rental fees accumulate and must be withdrawn before ownership transfer', async t => {
  const { rental, tenant, other, successor } = await fixture(t);
  await mined(rental.connect(tenant).rentProperty({ value: rent }));
  await mined(rental.connect(tenant).endRental());
  await mined(rental.connect(other).rentProperty({ value: rent }));
  await mined(rental.connect(other).endRental());
  assert.equal(await rental.unwithdrawnRent(), rent * 2n);
  await assert.rejects(rental.transferOwnership.staticCall(await successor.getAddress()), /Withdraw earned rent/);
  await mined(rental.withdrawRent());
  await mined(rental.transferOwnership(await successor.getAddress()));
});

test('ownership transfer emits both addresses and moves access rights to the new owner', async t => {
  const { rental, owner, successor } = await fixture(t);
  const receipt = await mined(rental.transferOwnership(await successor.getAddress()));
  const args = event(rental, receipt, 'OwnershipTransferred');
  assert.equal(args.previousOwner, await owner.getAddress());
  assert.equal(args.newOwner, await successor.getAddress());
  assert.equal(await rental.owner(), await successor.getAddress());
  await assert.rejects(rental.setRentAmount.staticCall(rent * 2n), /Only the owner/);
  await assert.rejects(rental.withdrawRent.staticCall(), /Only the owner/);
  await assert.rejects(rental.transferOwnership.staticCall(await owner.getAddress()), /Only the owner/);
  await mined(rental.connect(successor).setRentAmount(rent * 2n));
  await assert.rejects(rental.connect(successor).rentProperty.staticCall({ value: rent * 2n }), /Owner cannot rent/);
  await mined(rental.rentProperty({ value: rent * 2n })); // Former owner can now be a tenant.
});

test('failed ETH delivery restores the withdrawal accounting and funds', async t => {
  const { owner, tenant, chain } = await fixture(t);
  const helper = await new ContractFactory(helperCompiled.abi, helperCompiled.evm.bytecode.object, owner).deploy();
  await helper.waitForDeployment();
  const rental = new (await import('ethers')).Contract(await helper.rental(), compiled.abi, owner);
  await mined(rental.connect(tenant).rentProperty({ value: rent }));
  await mined(helper.configure(true, false));
  await assert.rejects(mined(helper.withdraw({ gasLimit: 500000 })), /revert/);
  assert.equal(await rental.unwithdrawnRent(), rent);
  assert.equal(await balance(chain, await rental.getAddress()), rent);
  await mined(helper.configure(false, false));
  await mined(helper.withdraw());
  assert.equal(await helper.received(), rent);
});

test('an owner contract cannot withdraw the same rent again during its payment callback', async t => {
  const { owner, tenant, chain } = await fixture(t);
  const helper = await new ContractFactory(helperCompiled.abi, helperCompiled.evm.bytecode.object, owner).deploy();
  await helper.waitForDeployment();
  const rental = new (await import('ethers')).Contract(await helper.rental(), compiled.abi, owner);
  await mined(rental.connect(tenant).rentProperty({ value: rent }));
  await mined(helper.configure(false, true));
  await mined(helper.withdraw());
  assert.equal(await helper.reentrySucceeded(), false);
  assert.equal(await helper.received(), rent);
  assert.equal(await rental.unwithdrawnRent(), 0n);
  assert.equal(await balance(chain, await rental.getAddress()), 0n);
});
