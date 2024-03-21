import { createSchema } from "@ponder/core";

export default createSchema((p) => ({
  Order: p.createTable({
    id: p.string(),
    chainId: p.int(),
    blockNumber: p.bigint(),
    blockTimestamp: p.bigint(),
    hash: p.hex(),
    salt: p.hex(),
    user: p.string().references("User.id"),
    userId: p.one("user"),
    staticInput: p.hex(),
    decodedSuccess: p.boolean(),
    stopLossOrderId: p.string().references("StopLossOrder.id").optional(),
    stopLossOrder: p.one("stopLossOrderId"),
    orderHandlerId: p.string().references("OrderHandler.id").optional(),
    orderHandler: p.one("orderHandlerId"),
    productConstantOrderId: p
      .string()
      .references("ProductConstantOrder.id")
      .optional(),
    productConstantOrder: p.one("productConstantOrderId"),
  }),
  OrderHandler: p.createTable({
    id: p.string(),
    type: p.string().optional(),
    address: p.hex(),
    chainId: p.int(),
  }),
  Token: p.createTable({
    id: p.string(),
    address: p.hex(),
    chainId: p.int(),
    name: p.string(),
    symbol: p.string(),
    decimals: p.int(),
  }),
  User: p.createTable({
    id: p.string(),
    address: p.string(),
    chainId: p.int(),
    orders: p.many("Order.user"),
  }),
  StopLossOrder: p.createTable({
    id: p.string(),
    orderId: p.string().references("Order.id"),
    tokenInId: p.string().references("Token.id"),
    tokenIn: p.one("tokenInId"),
    tokenAmountIn: p.bigint(),
    tokenOutId: p.string().references("Token.id"),
    tokenOut: p.one("tokenOutId"),
    tokenAmountOut: p.bigint(),
    appData: p.hex(),
    to: p.hex(),
    isSellOrder: p.boolean(),
    isPartiallyFillable: p.boolean(),
    validityBucketSeconds: p.bigint(),
    sellTokenPriceOracle: p.hex(),
    buyTokenPriceOracle: p.hex(),
    strike: p.bigint(),
    maxTimeSinceLastOracleUpdate: p.bigint(),
  }),
  ProductConstantOrder: p.createTable({
    id: p.string(),
    orderId: p.string().references("Order.id"),
    token0Id: p.string().references("Token.id"),
    token0: p.one("token0Id"),
    token1Id: p.string().references("Token.id"),
    token1: p.one("token1Id"),
    minTradedToken0: p.bigint(),
    priceOracle: p.hex(),
    priceOracleData: p.hex(),
    appData: p.hex(),
  }),
}));
