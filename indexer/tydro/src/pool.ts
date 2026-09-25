import { Address, BigInt, dataSource, ethereum } from "@graphprotocol/graph-ts";
import {
  Borrow,
  FlashLoan,
  LiquidationCall,
  Pool,
  Repay,
  ReserveUsedAsCollateralDisabled,
  ReserveUsedAsCollateralEnabled,
  Supply,
  Withdraw,
} from "../generated/Pool/Pool";
import { AaveOracle } from "../generated/Pool/AaveOracle";
import { ERC20 } from "../generated/Pool/ERC20";
import { ProtocolDataProvider } from "../generated/Pool/ProtocolDataProvider";
import { PoolEvent, Reserve, ReserveSnapshot } from "../generated/schema";

// Tydro docs → Smart Contracts; verified on-chain 2026-09-25.
const DATA_PROVIDER = Address.fromString("0x96086C25d13943C80Ff9a19791a40Df6aFC08328");
const ORACLE = Address.fromString("0x4758213271BFdC72224A7a8742dC865fC97756e1");

function getOrCreateReserve(asset: Address, block: ethereum.Block): Reserve {
  let reserve = Reserve.load(asset);
  if (reserve != null) return reserve;

  reserve = new Reserve(asset);
  const token = ERC20.bind(asset);
  const symbol = token.try_symbol();
  const decimals = token.try_decimals();
  reserve.symbol = symbol.reverted ? "Unknown" : symbol.value;
  // -1 marks unknown decimals; consumers must not format amounts for such reserves.
  reserve.decimals = decimals.reverted ? -1 : decimals.value;
  reserve.firstSeenBlock = block.number;
  reserve.save();
  return reserve;
}

function newEvent(event: ethereum.Event, type: string, asset: Address, user: Address, amount: BigInt): PoolEvent {
  const reserve = getOrCreateReserve(asset, event.block);
  const entity = new PoolEvent(event.transaction.hash.concatI32(event.logIndex.toI32()));
  entity.type = type;
  entity.reserve = reserve.id;
  entity.user = user;
  entity.amount = amount;
  entity.blockNumber = event.block.number;
  entity.timestamp = event.block.timestamp;
  entity.txHash = event.transaction.hash;
  entity.logIndex = event.logIndex;
  return entity;
}

export function handleSupply(event: Supply): void {
  const e = newEvent(event, "supply", event.params.reserve, event.params.onBehalfOf, event.params.amount);
  e.caller = event.params.user;
  e.save();
}

export function handleWithdraw(event: Withdraw): void {
  newEvent(event, "withdraw", event.params.reserve, event.params.user, event.params.amount).save();
}

export function handleBorrow(event: Borrow): void {
  const e = newEvent(event, "borrow", event.params.reserve, event.params.onBehalfOf, event.params.amount);
  e.caller = event.params.user;
  e.interestRateMode = event.params.interestRateMode;
  e.save();
}

export function handleRepay(event: Repay): void {
  const e = newEvent(event, "repay", event.params.reserve, event.params.user, event.params.amount);
  e.caller = event.params.repayer;
  e.save();
}

export function handleLiquidationCall(event: LiquidationCall): void {
  const e = newEvent(event, "liquidation", event.params.debtAsset, event.params.user, event.params.debtToCover);
  getOrCreateReserve(event.params.collateralAsset, event.block);
  e.collateralAsset = event.params.collateralAsset;
  e.liquidatedCollateralAmount = event.params.liquidatedCollateralAmount;
  e.liquidator = event.params.liquidator;
  e.save();
}

export function handleCollateralEnabled(event: ReserveUsedAsCollateralEnabled): void {
  const e = newEvent(event, "collateral_change", event.params.reserve, event.params.user, BigInt.zero());
  e.usedAsCollateral = true;
  e.save();
}

export function handleCollateralDisabled(event: ReserveUsedAsCollateralDisabled): void {
  const e = newEvent(event, "collateral_change", event.params.reserve, event.params.user, BigInt.zero());
  e.usedAsCollateral = false;
  e.save();
}

export function handleFlashLoan(event: FlashLoan): void {
  const e = newEvent(event, "flash_loan", event.params.asset, event.params.initiator, event.params.amount);
  e.caller = event.params.target;
  e.premium = event.params.premium;
  e.save();
}

/** Reads every reserve's totals, rates and oracle price at this block. Reverted calls skip that reserve. */
export function handleSnapshotBlock(block: ethereum.Block): void {
  const pool = Pool.bind(dataSource.address());
  const list = pool.try_getReservesList();
  if (list.reverted) return;

  const dataProvider = ProtocolDataProvider.bind(DATA_PROVIDER);
  const oracle = AaveOracle.bind(ORACLE);

  for (let i = 0; i < list.value.length; i++) {
    const asset = list.value[i];
    const data = dataProvider.try_getReserveData(asset);
    if (data.reverted) continue;

    const reserve = getOrCreateReserve(asset, block);
    const snapshot = new ReserveSnapshot(asset.concatI32(block.number.toI32()));
    snapshot.reserve = reserve.id;
    snapshot.blockNumber = block.number;
    snapshot.timestamp = block.timestamp;
    snapshot.totalSupplied = data.value.getTotalAToken();
    snapshot.totalBorrowed = data.value.getTotalStableDebt().plus(data.value.getTotalVariableDebt());
    snapshot.liquidityRate = data.value.getLiquidityRate();
    snapshot.variableBorrowRate = data.value.getVariableBorrowRate();
    const price = oracle.try_getAssetPrice(asset);
    if (!price.reverted) snapshot.priceUsd = price.value;
    snapshot.save();
  }
}
