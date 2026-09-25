import { describe, expect, it } from "vitest";
import { getAddress, type Log } from "viem";
import { normalizeTydroLogs, type ReserveInfo } from "../src/protocols/tydro/events.js";
import fixtures from "./fixtures/tydro-pool-logs.json" with { type: "json" };

// Real Tydro Pool logs captured from Ink mainnet receipts (see fixture txHash fields).
const USDT0 = getAddress("0x0200c29006150606b650577bbe7b6248f58470c1");
const USDC = getAddress("0x2d270e6886d130d724215a266106e6832161eaed");
const WETH = getAddress("0x4200000000000000000000000000000000000006");

const reserves = new Map<string, ReserveInfo>([
  [USDT0, { symbol: "USD₮0", decimals: 6, priceUsd: 1 }],
  [USDC, { symbol: "USDC", decimals: 6, priceUsd: 1 }],
  [WETH, { symbol: "WETH", decimals: 18, priceUsd: 2000 }],
]);

type Fixture = (typeof fixtures)[keyof typeof fixtures];

function run(fixture: Fixture) {
  const logs = fixture.logs.map(
    (l) =>
      ({
        ...l,
        blockNumber: BigInt(l.blockNumber),
        logIndex: Number(l.logIndex),
      }) as unknown as Log,
  );
  const block = logs[0]!.blockNumber!;
  return normalizeTydroLogs(
    logs,
    new Map([[block, fixture.blockTimestamp * 1000]]),
    (asset) => reserves.get(getAddress(asset)),
    { source: "ink-rpc", reference: "test", retrievedAt: 0 },
  );
}

describe("normalizeTydroLogs", () => {
  it("drops ReserveDataUpdated bookkeeping and decodes a supply", () => {
    const events = run(fixtures.supply);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      protocol: "tydro",
      type: "supply",
      wallet: getAddress("0xdbd87325d7b1189dcc9255c4926076ff4a96a271"),
      asset: { address: USDC, symbol: "USDC" },
      amount: { raw: "146456766", decimals: 6, formatted: "146.456766" },
      txHash: fixtures.supply.txHash,
      timestamp: fixtures.supply.blockTimestamp * 1000,
      explorerUrl: `https://explorer.inkonchain.com/tx/${fixtures.supply.txHash}`,
    });
  });

  it("uses onBehalfOf as the wallet for borrows and keeps the rate mode", () => {
    const [borrow] = run(fixtures.borrow);
    expect(borrow).toMatchObject({
      type: "borrow",
      wallet: getAddress("0xb5a9b14a07fa124c3ffa9e5d773b27e372bc07d8"),
      amount: { raw: "30000000", formatted: "30" },
      metadata: { interestRateMode: 2 },
    });
    expect(borrow!.amountUsd).toBeCloseTo(30);
  });

  it("decodes a liquidation (debt asset + collateral metadata) and the flash loan that funded it", () => {
    const events = run(fixtures.liquidation);
    expect(events.map((e) => e.type).sort()).toEqual(["flash_loan", "liquidation"]);

    const liquidation = events.find((e) => e.type === "liquidation")!;
    expect(liquidation).toMatchObject({
      wallet: getAddress("0x226264e3560c23861d04797ff4746dd8f8778315"),
      asset: { address: USDT0 },
      amount: { raw: "159063097", formatted: "159.063097" },
      metadata: {
        collateralAsset: WETH,
        liquidatedCollateralRaw: "45310183656275620",
        liquidator: getAddress("0xf0570ec48d03171a80ff796dceadf0d385a00004"),
        receiveAToken: false,
      },
    });
  });

  it("classifies undecodable logs as unknown instead of guessing", () => {
    const log = { ...fixtures.supply.logs[1]!, topics: ["0x" + "ab".repeat(32)] };
    const events = run({ ...fixtures.supply, logs: [log] });
    expect(events).toEqual([expect.objectContaining({ type: "unknown", metadata: expect.objectContaining({ eventName: null }) })]);
  });

  it("labels assets that are not Tydro reserves as Unknown without an amount", () => {
    const events = normalizeTydroLogs(
      fixtures.supply.logs.map((l) => ({ ...l, blockNumber: BigInt(l.blockNumber), logIndex: Number(l.logIndex) }) as unknown as Log),
      new Map(),
      () => undefined,
      { source: "ink-rpc", reference: "test", retrievedAt: 0 },
    );
    expect(events[0]).toMatchObject({ asset: { symbol: "Unknown" }, amount: undefined, amountUsd: undefined });
  });
});
