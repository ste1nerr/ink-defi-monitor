import { parseAbi } from "viem";

/** Aave v3 AaveProtocolDataProvider (stable across v3.x). */
export const dataProviderAbi = parseAbi([
  "function getAllReservesTokens() view returns ((string symbol, address tokenAddress)[])",
  "function getReserveData(address asset) view returns (uint256 unbacked, uint256 accruedToTreasuryScaled, uint256 totalAToken, uint256 totalStableDebt, uint256 totalVariableDebt, uint256 liquidityRate, uint256 variableBorrowRate, uint256 stableBorrowRate, uint256 averageStableBorrowRate, uint256 liquidityIndex, uint256 variableBorrowIndex, uint40 lastUpdateTimestamp)",
  "function getReserveConfigurationData(address asset) view returns (uint256 decimals, uint256 ltv, uint256 liquidationThreshold, uint256 liquidationBonus, uint256 reserveFactor, bool usageAsCollateralEnabled, bool borrowingEnabled, bool stableBorrowRateEnabled, bool isActive, bool isFrozen)",
  "function getUserReserveData(address asset, address user) view returns (uint256 currentATokenBalance, uint256 currentStableDebt, uint256 currentVariableDebt, uint256 principalStableDebt, uint256 scaledVariableDebt, uint256 stableBorrowRate, uint256 liquidityRate, uint40 stableRateLastUpdated, bool usageAsCollateralEnabled)",
]);

/** AaveOracle: prices in BASE_CURRENCY_UNIT (1e8 = 1 USD on Tydro, verified). */
export const oracleAbi = parseAbi([
  "function getAssetPrice(address asset) view returns (uint256)",
  "function BASE_CURRENCY_UNIT() view returns (uint256)",
]);

/** Aave v3 Pool events surfaced by the monitor, plus bookkeeping events we deliberately skip. */
export const poolEventsAbi = parseAbi([
  "event Supply(address indexed reserve, address user, address indexed onBehalfOf, uint256 amount, uint16 indexed referralCode)",
  "event Withdraw(address indexed reserve, address indexed user, address indexed to, uint256 amount)",
  "event Borrow(address indexed reserve, address user, address indexed onBehalfOf, uint256 amount, uint8 interestRateMode, uint256 borrowRate, uint16 indexed referralCode)",
  "event Repay(address indexed reserve, address indexed user, address indexed repayer, uint256 amount, bool useATokens)",
  "event LiquidationCall(address indexed collateralAsset, address indexed debtAsset, address indexed user, uint256 debtToCover, uint256 liquidatedCollateralAmount, address liquidator, bool receiveAToken)",
  "event ReserveUsedAsCollateralEnabled(address indexed reserve, address indexed user)",
  "event ReserveUsedAsCollateralDisabled(address indexed reserve, address indexed user)",
  "event FlashLoan(address indexed target, address initiator, address indexed asset, uint256 amount, uint8 interestRateMode, uint256 premium, uint16 indexed referralCode)",
  "event UserEModeSet(address indexed user, uint8 categoryId)",
  "event ReserveDataUpdated(address indexed reserve, uint256 liquidityRate, uint256 stableBorrowRate, uint256 variableBorrowRate, uint256 liquidityIndex, uint256 variableBorrowIndex)",
  "event MintedToTreasury(address indexed reserve, uint256 amountMinted)",
  "event IsolationModeTotalDebtUpdated(address indexed asset, uint256 totalDebt)",
]);

/** Emitted alongside every user action; not user activity. */
export const BOOKKEEPING_EVENTS = new Set(["ReserveDataUpdated", "MintedToTreasury", "IsolationModeTotalDebtUpdated"]);
