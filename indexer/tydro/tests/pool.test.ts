import { Address, BigInt, Bytes, ethereum } from "@graphprotocol/graph-ts";
import { afterEach, assert, clearStore, createMockedFunction, dataSourceMock, describe, newMockEvent, test } from "matchstick-as/assembly/index";
import { LiquidationCall, Supply } from "../generated/Pool/Pool";
import { handleLiquidationCall, handleSnapshotBlock, handleSupply } from "../src/pool";

// Values from real Ink mainnet receipts (same fixtures as server/test/fixtures/tydro-pool-logs.json).
const USDC = Address.fromString("0x2d270e6886d130d724215a266106e6832161eaed");
const USDT0 = Address.fromString("0x0200c29006150606b650577bbe7b6248f58470c1");
const WETH = Address.fromString("0x4200000000000000000000000000000000000006");
const DATA_PROVIDER = Address.fromString("0x96086C25d13943C80Ff9a19791a40Df6aFC08328");
const ORACLE = Address.fromString("0x4758213271BFdC72224A7a8742dC865fC97756e1");

function mockToken(token: Address, symbol: string, decimals: i32): void {
  createMockedFunction(token, "symbol", "symbol():(string)").returns([ethereum.Value.fromString(symbol)]);
  createMockedFunction(token, "decimals", "decimals():(uint8)").returns([ethereum.Value.fromI32(decimals)]);
}

function param(name: string, value: ethereum.Value): ethereum.EventParam {
  return new ethereum.EventParam(name, value);
}

describe("Tydro Pool mappings", () => {
  afterEach(() => clearStore());

  test("supply is stored against onBehalfOf with the raw amount", () => {
    mockToken(USDC, "USDC", 6);
    const wallet = Address.fromString("0xdbd87325d7b1189dcc9255c4926076ff4a96a271");
    const event = changetype<Supply>(newMockEvent());
    event.parameters = [
      param("reserve", ethereum.Value.fromAddress(USDC)),
      param("user", ethereum.Value.fromAddress(wallet)),
      param("onBehalfOf", ethereum.Value.fromAddress(wallet)),
      param("amount", ethereum.Value.fromUnsignedBigInt(BigInt.fromString("146456766"))),
      param("referralCode", ethereum.Value.fromI32(0)),
    ];
    handleSupply(event);

    const id = event.transaction.hash.concatI32(event.logIndex.toI32()).toHexString();
    assert.fieldEquals("PoolEvent", id, "type", "supply");
    assert.fieldEquals("PoolEvent", id, "user", wallet.toHexString());
    assert.fieldEquals("PoolEvent", id, "amount", "146456766");
    assert.fieldEquals("Reserve", USDC.toHexString(), "symbol", "USDC");
    assert.fieldEquals("Reserve", USDC.toHexString(), "decimals", "6");
  });

  test("liquidation keeps debt asset as reserve and records collateral details", () => {
    mockToken(USDT0, "USD₮0", 6);
    mockToken(WETH, "WETH", 18);
    const user = Address.fromString("0x226264e3560c23861d04797ff4746dd8f8778315");
    const liquidator = Address.fromString("0xf0570ec48d03171a80ff796dceadf0d385a00004");
    const event = changetype<LiquidationCall>(newMockEvent());
    event.parameters = [
      param("collateralAsset", ethereum.Value.fromAddress(WETH)),
      param("debtAsset", ethereum.Value.fromAddress(USDT0)),
      param("user", ethereum.Value.fromAddress(user)),
      param("debtToCover", ethereum.Value.fromUnsignedBigInt(BigInt.fromString("159063097"))),
      param("liquidatedCollateralAmount", ethereum.Value.fromUnsignedBigInt(BigInt.fromString("45310183656275620"))),
      param("liquidator", ethereum.Value.fromAddress(liquidator)),
      param("receiveAToken", ethereum.Value.fromBoolean(false)),
    ];
    handleLiquidationCall(event);

    const id = event.transaction.hash.concatI32(event.logIndex.toI32()).toHexString();
    assert.fieldEquals("PoolEvent", id, "type", "liquidation");
    assert.fieldEquals("PoolEvent", id, "reserve", USDT0.toHexString());
    assert.fieldEquals("PoolEvent", id, "amount", "159063097");
    assert.fieldEquals("PoolEvent", id, "collateralAsset", WETH.toHexString());
    assert.fieldEquals("PoolEvent", id, "liquidatedCollateralAmount", "45310183656275620");
    assert.fieldEquals("PoolEvent", id, "liquidator", liquidator.toHexString());
    assert.entityCount("Reserve", 2);
  });

  test("snapshot block stores totals, rates and oracle price per reserve", () => {
    mockToken(USDC, "USDC", 6);
    const pool = Address.fromString("0x2816cf15F6d2A220E789aA011D5EE4eB6c47FEbA");
    dataSourceMock.setAddress(pool.toHexString());
    createMockedFunction(pool, "getReservesList", "getReservesList():(address[])").returns([
      ethereum.Value.fromAddressArray([USDC]),
    ]);
    const u = (s: string): ethereum.Value => ethereum.Value.fromUnsignedBigInt(BigInt.fromString(s));
    createMockedFunction(
      DATA_PROVIDER,
      "getReserveData",
      "getReserveData(address):(uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint40)",
    )
      .withArgs([ethereum.Value.fromAddress(USDC)])
      .returns([u("0"), u("0"), u("1000"), u("0"), u("750"), u("11"), u("22"), u("0"), u("0"), u("1"), u("1"), u("0")]);
    createMockedFunction(ORACLE, "getAssetPrice", "getAssetPrice(address):(uint256)")
      .withArgs([ethereum.Value.fromAddress(USDC)])
      .returns([u("99989041")]);

    const block = newMockEvent().block;
    handleSnapshotBlock(block);

    const id = Bytes.fromHexString(USDC.toHexString()).concatI32(block.number.toI32()).toHexString();
    assert.fieldEquals("ReserveSnapshot", id, "totalSupplied", "1000");
    assert.fieldEquals("ReserveSnapshot", id, "totalBorrowed", "750");
    assert.fieldEquals("ReserveSnapshot", id, "liquidityRate", "11");
    assert.fieldEquals("ReserveSnapshot", id, "variableBorrowRate", "22");
    assert.fieldEquals("ReserveSnapshot", id, "priceUsd", "99989041");
  });
});
