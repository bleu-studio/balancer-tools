import { relations } from "drizzle-orm";
import {
  bigint,
  boolean,
  decimal,
  integer,
  json,
  pgTable,
  serial,
  timestamp,
  unique,
  varchar,
} from "drizzle-orm/pg-core";

export const pools = pgTable(
  "pools",
  {
    id: serial("id").primaryKey(),
    externalId: varchar("external_id").unique(),
    poolType: varchar("pool_type"),
    name: varchar("name"),
    address: varchar("address"),
    totalLiquidity: decimal("total_liquidity"),
    symbol: varchar("symbol"),
    externalCreatedAt: timestamp("external_created_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    networkSlug: varchar("network_slug").references(() => networks.slug),
    rawData: json("raw_data"),
  },
  (t) => ({
    unq: unique().on(t.address, t.networkSlug),
  })
);

export const poolRelations = relations(pools, ({ one, many }) => ({
  tokens: many(poolTokens),
  poolSnapshots: many(poolSnapshots),
  gauge: one(gauges, {
    fields: [pools.externalId],
    references: [gauges.poolExternalId],
  }),
}));

export const blocks = pgTable(
  "blocks",
  {
    id: serial("id").primaryKey(),
    number: integer("number"),
    timestamp: timestamp("timestamp"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    networkSlug: varchar("network_slug").references(() => networks.slug),
    rawData: json("raw_data"),
  },
  (t) => ({
    unq: unique().on(t.number, t.networkSlug),
  })
);

export const blockRelations = relations(blocks, ({ many }) => ({
  gaugeSnapshots: many(gaugeSnapshots),
}));

export const tokens = pgTable(
  "tokens",
  {
    id: serial("id").primaryKey(),
    address: varchar("address"),
    symbol: varchar("symbol"),
    name: varchar("name"),
    logoURI: varchar("logo_uri"),
    externalCreatedAt: timestamp("external_created_at"),
    networkSlug: varchar("network_slug").references(() => networks.slug),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    rawData: json("raw_data"),
  },
  (t) => ({
    unq: unique().on(t.address, t.networkSlug),
  })
);

export const tokenRelations = relations(tokens, ({ many }) => ({
  tokenPrices: many(tokenPrices),
  poolTokens: many(poolTokens),
}));

export const tokenPrices = pgTable("token_prices", {
  id: serial("id").primaryKey(),
  priceUSD: decimal("price_usd"),
  timestamp: timestamp("timestamp"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  tokenId: integer("token_id").references(() => tokens.id),
  tokenAddress: varchar("token_address"),
  networkSlug: varchar("network_slug").references(() => networks.slug),
  rawData: json("raw_data"),
},
(t) => ({
  unq: unique().on(t.tokenAddress, t.networkSlug, t.timestamp),
})
);

export const poolTokens = pgTable("pool_tokens", {
  id: serial("id").primaryKey(),
  weight: decimal("weight"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  poolExternalId: varchar("pool_external_id").references(() => pools.externalId),
  tokenId: integer("token_id").references(() => tokens.id),
  tokenAddress: varchar("token_address"),
  networkSlug: varchar("network_slug").references(() => networks.slug),
  rawData: json("raw_data")},
  (t) => ({
    unq: unique().on(t.poolExternalId, t.tokenId),
  })
);

export const networks = pgTable("networks", {
  id: serial("id").primaryKey(),
  name: varchar("name"),
  slug: varchar("slug").unique(),
  chainId: varchar("chain_id").unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const networkRelations = relations(networks, ({ many }) => ({
  pools: many(pools),
  blocks: many(blocks),
  tokens: many(tokens),
}));

export const poolSnapshots = pgTable("pool_snapshots", {
  id: serial("id").primaryKey(),
  amounts: json("amounts"),
  totalShares: decimal("total_shares"),
  swapVolume: decimal("swap_volume"),
  swapFees: decimal("swap_fees"),
  liquidity: decimal("liquidity"),
  timestamp: timestamp("timestamp"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  externalId: varchar("external_id").unique(),
  poolExternalId: varchar("pool_external_id").references(() => pools.externalId),
  rawData: json("raw_data"),
});

export const poolSnapshotRelations = relations(poolSnapshots, ({ one }) => ({
  pool: one(pools, {
    fields: [poolSnapshots.id],
    references: [pools.externalId],
  }),
}));

export const poolTokenRateProviders = pgTable("pool_rate_providers", {
  id: serial("id").primaryKey(),
  rate: decimal("rate"),
  vulnerabilityAffected: boolean("vulnerability_affected"),
  externalCreatedAt: timestamp("external_created_at"),
  poolTokenId: integer("pool_token_id").references(() => poolTokens.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  rawData: json("raw_data"),
});

export const poolTokenRateProviderRelations = relations(
  poolTokenRateProviders,
  ({ one }) => ({
    poolToken: one(poolTokens, {
      fields: [poolTokenRateProviders.id],
      references: [poolTokens.poolExternalId],
    }),
  })
);

export const vebalRounds = pgTable("vebal_rounds", {
  id: serial("id").primaryKey(),
  endDate: timestamp("end_date"),
  startDate: timestamp("start_date"),
  roundNumber: varchar("round_number"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const gauges = pgTable("gauges", {
  id: serial("id").primaryKey(),
  address: varchar("address"),
  isKilled: boolean("is_killed"),
  externalCreatedAt: timestamp("external_created_at"),
  poolExternalId: varchar("pool_external_id").references(() => pools.externalId),
  networkSlug: varchar("network_slug").references(() => networks.slug),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  rawData: json("raw_data"),
}, (t) => ({
  unq: unique().on(t.address, t.poolExternalId),
}))

export const gaugeRelations = relations(gauges, ({ many }) => ({
  gaugeSnapshots: many(gaugeSnapshots),
}));

export const gaugeSnapshots = pgTable("gauge_relative_weights", {
  id: serial("id").primaryKey(),
  relativeWeight: bigint("relative_weight", { mode: "number" }),
  timestamp: timestamp("timestamp"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  blockId: integer("block_id").references(() => blocks.id),
  gaugeId: integer("gauge_id").references(() => gauges.id),
  rawData: json("raw_data"),
});
