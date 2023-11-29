/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable no-console */
/* eslint-env node */
// eslint-disable-next-line @typescript-eslint/no-var-requires
import "dotenv/config";

import { dateToEpoch } from "@bleu-fi/utils/date";
import { and, asc, eq, gt, isNotNull, sql } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import { Address } from "viem";

import { db } from "./db/index";
import {
  balEmission,
  gauges,
  gaugeSnapshots,
  pools,
  poolSnapshots,
  poolSnapshotsTemp,
  tokenPrices,
  vebalRounds,
} from "./db/schema";
import * as balEmissions from "./lib/balancer/emissions";
import { DefiLlamaAPI } from "./lib/defillama";
import { getPoolRelativeWeights } from "./lib/getRelativeWeight";

const BATCH_SIZE = 1_000;

const isVerbose = process.argv.includes("-v");

function logIfVerbose(message: string) {
  if (isVerbose) {
    console.log(message);
  }
}

async function gql(
  endpoint: string,
  query: string,
  variables = {},
  headers = {},
) {
  logIfVerbose(`Running GraphQL query on ${endpoint}`);

  const defaultHeaders = {
    "Content-Type": "application/json",
  };
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        ...defaultHeaders,
        ...headers,
      },
      body: JSON.stringify({
        query,
        variables,
      }),
    });
    return response.json();
  } catch (e) {
    console.log("err", e);
  }
}

const ENDPOINT_V3 = "https://api-v3.balancer.fi/graphql";
const BASE_ENDPOINT_V2 =
  "https://api.thegraph.com/subgraphs/name/balancer-labs";

const NETWORK_TO_BALANCER_ENDPOINT_MAP = {
  ethereum: `${BASE_ENDPOINT_V2}/balancer-v2`,
  polygon: `${BASE_ENDPOINT_V2}/balancer-polygon-v2`,
  "polygon-zkevm":
    "https://api.studio.thegraph.com/query/24660/balancer-polygon-zk-v2/version/latest",
  arbitrum: `${BASE_ENDPOINT_V2}/balancer-arbitrum-v2`,
  gnosis: `${BASE_ENDPOINT_V2}/balancer-gnosis-chain-v2`,
  optimism: `${BASE_ENDPOINT_V2}/balancer-optimism-v2`,
  base: "https://api.studio.thegraph.com/query/24660/balancer-base-v2/version/latest",
  avalanche: `${BASE_ENDPOINT_V2}/balancer-avalanche-v2`,
} as const;

const VOTING_GAUGES_QUERY = `
query VeBalGetVotingList {
    veBalGetVotingList {
        chain
        id
        address
        symbol
        type
        gauge {
            address
            isKilled
            addedTimestamp
            relativeWeightCap
        }
        tokens {
            address
            logoURI
            symbol
            weight
        }
    }
}
`;

const POOLS_WITHOUT_GAUGE_QUERY = `
query PoolsWherePoolType($latestId: String!) {
  pools(
    first: 1000,
    where: {
      id_gt: $latestId,
    }
  ) {
    id
    address
    symbol
    poolType
    createTime
    poolTypeVersion
    tokens {
      isExemptFromYieldProtocolFee
      address
      symbol
      weight
    }
  }
}
`;

const POOLS_SNAPSHOTS = `
query PoolSnapshots($latestId: String!) {
  poolSnapshots(
    first: 1000,
    where: {
      id_gt: $latestId,
    }
  ) {
    id
    pool {
      id
      protocolYieldFeeCache
      protocolSwapFeeCache
    }
    amounts
    totalShares
    swapVolume
    protocolFee
    swapFees
    liquidity
    timestamp
  }
}
`;

function* chunks(arr: unknown[], n: number) {
  for (let i = 0; i < arr.length; i += n) {
    yield arr.slice(i, i + n);
  }
}

async function paginate<T>(
  initialId: string,
  step: number,
  fetchFn: (id: string) => Promise<T | null>,
): Promise<void> {
  logIfVerbose(`Paginating from initialId=${initialId}, step=${step}`);

  let idValue = initialId;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const data = await fetchFn(idValue);

    // @ts-ignore  this comes as unknown type, but it is an array
    const dataArray = Object.values(data)[0];

    // @ts-ignore  this comes as unknown type, but it is an array
    if (!data || dataArray.length < BATCH_SIZE) {
      break;
    }
    // @ts-ignore  this comes as unknown type, but it is an array
    idValue = dataArray[dataArray.length - 1].id;
    console.log(idValue);
  }
}

type ProcessFn<T> = (data: T) => Promise<void>;

async function paginatedFetch<T>(
  networkEndpoint: string,
  query: string,
  processFn: ProcessFn<T>,
  initialId = "",
  step = BATCH_SIZE,
): Promise<void> {
  await paginate(initialId, step, async (latestId: string) => {
    const response = await gql(networkEndpoint, query, { latestId });
    if (response.data) {
      await processFn(response.data);
      return response.data;
    }

    return null;
  });
}

async function processPoolSnapshots(data: any, network: string) {
  logIfVerbose(`Processing pool snapshots for network ${network}`);

  if (data.poolSnapshots) {
    await addToTable(
      poolSnapshotsTemp,
      data.poolSnapshots.map((snapshot: any) => ({
        externalId: snapshot.id,
        rawData: { ...snapshot, network },
      })),
    );
  }
}

async function processPools(data: any, network: string) {
  logIfVerbose(`Processing pools for network ${network}`);

  if (data.pools) {
    await addToTable(
      pools,
      data.pools.map((pool: any) => ({
        externalId: pool.id,
        rawData: { ...pool, network },
      })),
    );
  }
}

async function processGauges(data: any) {
  logIfVerbose(`Processing gauges`);

  if (data.veBalGetVotingList) {
    await addToTable(
      gauges,
      data.veBalGetVotingList.map((gauge: any) => ({
        address: gauge.gauge.address,
        rawData: { ...gauge },
      })),
    );
  }
}

async function extractPoolSnapshotsForNetwork(
  networkEndpoint: string,
  network: string,
) {
  await paginatedFetch(networkEndpoint, POOLS_SNAPSHOTS, (data) =>
    processPoolSnapshots(data, network),
  );
}

async function extractPoolsForNetwork(
  networkEndpoint: string,
  network: string,
) {
  await paginatedFetch(networkEndpoint, POOLS_WITHOUT_GAUGE_QUERY, (data) =>
    processPools(data, network),
  );
}

async function extractGauges() {
  const response = await gql(ENDPOINT_V3, VOTING_GAUGES_QUERY);
  await processGauges(response.data);
}

async function extractGaugesSnapshot() {
  try {
    // Fetch gauge addresses and corresponding timestamps
    const gaugeTimestamps = await db
      .select({
        gaugeAddress: gauges.address,
        timestamp: vebalRounds.startDate,
      })
      .from(poolSnapshots)
      .fullJoin(gauges, eq(poolSnapshots.poolExternalId, gauges.poolExternalId))
      .fullJoin(vebalRounds, eq(poolSnapshots.timestamp, vebalRounds.startDate))
      .where(
        and(
          gt(poolSnapshots.timestamp, gauges.externalCreatedAt),
          isNotNull(vebalRounds.startDate),
        ),
      )
      .orderBy(asc(vebalRounds.startDate));

    // Create tuples for batch processing
    const gaugeAddressTimestampTuples: [Address, number][] =
      gaugeTimestamps.map(({ gaugeAddress, timestamp }) => [
        gaugeAddress as Address,
        dateToEpoch(timestamp),
      ]);

    // Batch process to get relative weights
    logIfVerbose(
      `Fetching ${gaugeAddressTimestampTuples.length} relativeweight-timestamp pairs`,
    );
    const relativeWeights = await getPoolRelativeWeights(
      gaugeAddressTimestampTuples,
    );

    for (const [
      gaugeAddress,
      epochTimestamp,
      relativeWeight,
    ] of relativeWeights) {
      const timestamp = new Date(epochTimestamp * 1000); // Convert back to Date object

      // Fetch the round number for each timestamp
      const roundNumberList = await db
        .select({
          round_number: vebalRounds.roundNumber,
        })
        .from(vebalRounds)
        .where(eq(vebalRounds.startDate, timestamp));

      const roundNumber = roundNumberList[0]?.round_number;

      // Insert into gaugeSnapshots table
      if (roundNumber) {
        await db
          .insert(gaugeSnapshots)
          .values({
            gaugeAddress,
            timestamp: timestamp,
            relativeWeight: String(relativeWeight),
            roundNumber: roundNumber,
          })
          .onConflictDoNothing()
          .execute();
      }
    }
  } catch (error) {
    console.error(error);
  }
}

async function addToTable(table: any, items: any) {
  const chunkedItems = [...chunks(items, BATCH_SIZE)];
  return await Promise.all(
    chunkedItems.map(async (items) => {
      return await db.insert(table).values(items).onConflictDoNothing();
    }),
  );
}

async function transformNetworks(table: PgTable, key = "network") {
  await db.execute(sql`
INSERT INTO networks (slug)
SELECT
  CASE
    WHEN LOWER(raw_data->>'${sql.raw(key)}') = 'zkevm' THEN 'polygon-zkevm'
    WHEN LOWER(raw_data->>'${sql.raw(key)}') = 'mainnet' THEN 'ethereum'
    ELSE LOWER(raw_data->>'${sql.raw(key)}')
  END
FROM ${table}
WHERE LOWER(raw_data->>'${sql.raw(key)}') IS NOT NULL
ON CONFLICT (slug) DO NOTHING;
  `);
}

async function transformPoolSnapshotsData() {
  await transformNetworks(poolSnapshots, "network");

  await db.execute(sql`
  INSERT INTO pools (external_id, network_slug)
SELECT raw_data->'pool'->>'id', 
LOWER(raw_data->>'network')
FROM pool_snapshots_temp
ON CONFLICT (external_id) DO NOTHING;
  `);

  await db.execute(sql`
  UPDATE pool_snapshots_temp
SET
    amounts = raw_data->'amounts',
    total_shares = (raw_data->>'totalShares')::NUMERIC,
    swap_volume = (raw_data->>'swapVolume')::NUMERIC,
    swap_fees = (raw_data->>'swapFees')::NUMERIC,
    liquidity = (raw_data->>'liquidity')::NUMERIC,
    timestamp = to_timestamp((raw_data->>'timestamp')::BIGINT),
    external_id = raw_data->>'id',
    pool_external_id = raw_data->'pool'->>'id',
    protocol_yield_fee_cache = (raw_data->'pool'->>'protocolYieldFeeCache')::NUMERIC,
    protocol_swap_fee_cache = (raw_data->'pool'->>'protocolSwapFeeCache')::NUMERIC;
`);

  await db.execute(sql`
INSERT INTO pool_snapshots (amounts, total_shares, swap_volume, swap_fees, liquidity, timestamp, protocol_yield_fee_cache, protocol_swap_fee_cache, external_id, pool_external_id, raw_data)
WITH calendar AS (
  SELECT generate_series('2021-04-21' :: timestamp, CURRENT_DATE, '1 day' :: INTERVAL) AS "timestamp"
),

pool_snapshots AS (
  SELECT
    *,
    LEAD("timestamp", 1, NOW()) OVER (PARTITION BY pool_external_id ORDER BY "timestamp") AS timestamp_next_change
  FROM pool_snapshots_temp
)

SELECT amounts, total_shares, swap_volume, swap_fees, liquidity, c.timestamp, protocol_yield_fee_cache, protocol_swap_fee_cache, pool_external_id || '-' || c.timestamp AS external_id, pool_external_id, raw_data
FROM 
    pool_snapshots b
LEFT JOIN 
    calendar c 
ON 
    b.timestamp <= c.timestamp 
    AND (c.timestamp < b.timestamp_next_change OR b.timestamp_next_change IS NULL)
ON CONFLICT (external_id) DO NOTHING;
`);
}

async function transformPoolData() {
  // Transform the networks first
  await transformNetworks(pools, "network");

  // Insert data into the pools table
  await db.execute(sql`
  INSERT INTO pools (
    external_id, address, symbol, pool_type, external_created_at, network_slug, pool_type_version
  )
  SELECT 
    raw_data->>'id',
    raw_data->>'address',
    raw_data->>'symbol',
    raw_data->>'poolType',
    to_timestamp((raw_data->>'createTime')::BIGINT),
    LOWER(raw_data->>'network'),
    (raw_data->>'poolTypeVersion')::NUMERIC
  FROM pools
  ON CONFLICT (external_id) DO UPDATE
  SET 
    address = excluded.address,
    symbol = excluded.symbol,
    pool_type = excluded.pool_type,
    external_created_at = excluded.external_created_at,
    network_slug = LOWER(excluded.network_slug),
    pool_type_version = excluded.pool_type_version;
`);

  // Insert data into the tokens table from the 'tokens' array in raw_data
  await db.execute(sql`
    INSERT INTO tokens (address, symbol, network_slug)
    SELECT jsonb_array_elements(raw_data::jsonb->'tokens')->>'address',
           jsonb_array_elements(raw_data::jsonb->'tokens')->>'symbol',
           LOWER(raw_data->>'network')
    FROM pools
    ON CONFLICT (address, network_slug) DO NOTHING;
  `);

  // -- Insert data into pool_tokens table using a subquery
  await db.execute(sql`
    INSERT INTO pool_tokens (weight, pool_external_id, token_address, network_slug, token_index, is_exempt_from_yield_protocol_fee)
    SELECT DISTINCT ON (sub.external_id, tokens.address)
          sub.weight,
          sub.external_id,
          tokens.address,
          tokens.network_slug,
          sub.ordinality,
          sub.is_exempt_from_yield_protocol_fee
    FROM (
        SELECT (jsonb_array_elements(raw_data::jsonb->'tokens')->>'weight')::NUMERIC as weight,
              raw_data->>'id' as external_id,
              jsonb_array_elements(raw_data::jsonb->'tokens')->>'address' as address,
              (jsonb_array_elements(raw_data::jsonb->'tokens')->>'isExemptFromYieldProtocolFee')::BOOLEAN as is_exempt_from_yield_protocol_fee,
              ordinality
        FROM pools, jsonb_array_elements(raw_data::jsonb->'tokens') WITH ORDINALITY
    ) as sub
    JOIN tokens ON sub.address = tokens.address
    ON CONFLICT (pool_external_id, token_address) DO UPDATE
    SET weight = excluded.weight;
    `);
}

async function transformGauges() {
  await transformNetworks(gauges, "chain");

  // First, update the 'pools' table to make sure all the external_id values are there.
  await db.execute(sql`
  INSERT INTO pools (external_id, network_slug)
  SELECT
    raw_data ->> 'id',
    CASE WHEN LOWER(raw_data ->> 'chain') = 'zkevm' THEN 'polygon-zkevm'
    WHEN LOWER(raw_data ->> 'chain') = 'mainnet' THEN 'ethereum'
    ELSE
      LOWER(raw_data ->> 'chain')
    END
  FROM
    gauges ON CONFLICT (external_id)
    DO NOTHING;
  `);

  // Then, insert or update the 'gauges' table.
  await db.execute(sql`
  INSERT INTO gauges (address, is_killed, external_created_at, pool_external_id, network_slug)
  SELECT
      raw_data->'gauge'->>'address',
      (raw_data->'gauge'->>'isKilled')::BOOLEAN,
      to_timestamp((raw_data->'gauge'->>'addedTimestamp')::BIGINT),
      raw_data->>'id',
      CASE
          WHEN LOWER(raw_data->>'chain') = 'zkevm' THEN 'polygon-zkevm'
          WHEN LOWER(raw_data->>'chain') = 'mainnet' THEN 'ethereum'
          ELSE LOWER(raw_data->>'chain')
      END
  FROM gauges
  ON CONFLICT (address, pool_external_id)
  DO UPDATE SET is_killed = EXCLUDED.is_killed
  WHERE gauges.address IS DISTINCT FROM EXCLUDED.address;`);

  //TODO: get raw_data to the gauges table, this is creating new rows and deleting old ones, so the id starts on 267

  // delete rows that are no longer needed
  await db.execute(
    sql`
  DELETE FROM gauges
  WHERE NOT EXISTS (
    SELECT 1 FROM gauges g
    WHERE g.address = gauges.address
    AND g.pool_external_id = gauges.pool_external_id
  );`,
  );
}

async function ETLGauges() {
  logIfVerbose("Starting Gauges Extraction");
  await extractGauges();
  logIfVerbose("Starting Gauges Transformation");
  await transformGauges();
}

async function ETLGaugesSnapshot() {
  logIfVerbose("Starting Gauges Snapshot Extraction");
  await extractGaugesSnapshot();
}

const networkNames = Object.keys(
  NETWORK_TO_BALANCER_ENDPOINT_MAP,
) as (keyof typeof NETWORK_TO_BALANCER_ENDPOINT_MAP)[];

async function ETLPools() {
  logIfVerbose("Starting Pools Extraction");

  await Promise.all(
    networkNames.map(async (networkName) => {
      const networkEndpoint = NETWORK_TO_BALANCER_ENDPOINT_MAP[networkName];
      await extractPoolsForNetwork(networkEndpoint, networkName);
    }),
  );
  logIfVerbose("Starting Pools Transformation");
  await transformPoolData();
}

async function ETLSnapshots() {
  logIfVerbose("Starting Pool Snapshots Extraction");
  await Promise.all(
    networkNames.map(async (networkName) => {
      const networkEndpoint = NETWORK_TO_BALANCER_ENDPOINT_MAP[networkName];
      await extractPoolSnapshotsForNetwork(networkEndpoint, networkName);
    }),
  );

  logIfVerbose("Starting Pool Snapshots Extraction");
  await transformPoolSnapshotsData();
}

async function seedNetworks() {
  logIfVerbose("Seeding networks");

  return await db.execute(sql`
INSERT INTO networks (name, slug, chain_id) VALUES
('Ethereum', 'ethereum', 1),
('Polygon', 'polygon', 137),
('Arbitrum', 'arbitrum', 42161),
('Gnosis', 'gnosis', 100),
('Optimism', 'optimism', 10),
('Goerli', 'goerli', 5),
('Sepolia', 'sepolia', 11155111),
('PolygonZKEVM', 'polygon-zkevm', 1101),
('Base', 'base', 8453),
('Avalanche', 'avalanche', 43114)
ON CONFLICT (slug)
DO UPDATE SET chain_id = EXCLUDED.chain_id, updated_at = NOW();
`);
}

async function seedVebalRounds() {
  logIfVerbose("Seeding veBAL rounds");

  const startDate = new Date("2022-04-14T00:00:00.000Z");
  let roundNumber = 1;

  while (startDate <= new Date()) {
    const endDate = new Date(startDate);
    endDate.setUTCDate(endDate.getUTCDate() + 6);
    endDate.setUTCHours(23, 59, 59, 999);

    await addToTable(vebalRounds, [
      {
        startDate: startDate,
        endDate: endDate,
        roundNumber: roundNumber,
      },
    ]);

    startDate.setUTCDate(startDate.getUTCDate() + 7);
    roundNumber++;
  }
}

async function seedBalEmission() {
  const timestamps = await db
    .selectDistinct({ timestamp: poolSnapshots.timestamp })
    .from(poolSnapshots);

  for (const { timestamp } of timestamps) {
    if (!timestamp) continue;
    try {
      const weeklyBalEmission = balEmissions.weekly(dateToEpoch(timestamp));

      await db
        .insert(balEmission)
        .values({
          timestamp: timestamp,
          weekEmission: String(weeklyBalEmission),
        })
        .onConflictDoNothing()
        .execute();
    } catch (error) {
      console.error(`${error}`);
    }
  }
}

async function calculateApr() {
  // Fee APR
  logIfVerbose("Seeding Fee APR");
  await db.execute(sql`
  INSERT INTO swap_fee_apr (timestamp, pool_external_id, collected_fees_usd, value, external_id)
  SELECT
	p1.timestamp,
	p1.pool_external_id,
	p1.swap_fees - p2.swap_fees AS collected_fees_usd,
    CASE 
        WHEN p1.liquidity = 0 THEN 0
        ELSE ((p1.swap_fees - p2.swap_fees) * (1 - COALESCE(p1.protocol_swap_fee_cache, 0.5)) / p1.liquidity) * 365 * 100 
    END AS "value",
  p1.external_id
FROM pool_snapshots p1
LEFT JOIN pool_snapshots p2 
ON p1. "timestamp" = p2. "timestamp" + INTERVAL '1 day'
AND p1.pool_external_id = p2.pool_external_id
ON CONFLICT (external_id) DO NOTHING;
`);

  // veBAL APR
  logIfVerbose("Seeding veBAL APR");
  await db.execute(sql`
INSERT INTO vebal_apr (timestamp, value, pool_external_id, external_id)
SELECT DISTINCT
    ps.timestamp,
    CASE
        WHEN ps.liquidity = 0 THEN 0
        ELSE (52 * (be.week_emission * gs.relative_weight * tp.price_usd) / ps.liquidity) * 100
    END AS value,
    ps.pool_external_id,
    ps.external_id
FROM pool_snapshots ps
LEFT JOIN vebal_rounds vr ON ps.timestamp BETWEEN vr.start_date AND vr.end_date
JOIN gauges g ON g.pool_external_id = ps.pool_external_id
JOIN gauge_snapshots gs ON g.address = gs.gauge_address
    AND vr.round_number = gs.round_number
LEFT JOIN token_prices tp ON tp.token_address = '0xba100000625a3754423978a60c9317c58a424e3d'
    AND tp.timestamp = ps.timestamp
LEFT JOIN bal_emission be ON be.timestamp = ps.timestamp
ON CONFLICT (external_id) DO NOTHING;
`);
}

async function fetchBalPrices() {
  try {
    // Get unique timestamps from pool_snapshots table

    const result = await db
      .selectDistinct({ timestamp: poolSnapshots.timestamp })
      .from(poolSnapshots)
      .orderBy(asc(poolSnapshots.timestamp));

    // Iterate over each timestamp
    for (const row of result) {
      const day = row.timestamp as Date;

      const utcMidnightTimestampOfCurrentDay = new Date(
        Date.UTC(
          day.getUTCFullYear(),
          day.getUTCMonth(),
          day.getUTCDate(),
          0,
          0,
          0,
          0,
        ),
      );

      // Fetch BAL price for the timestamp
      const prices = await DefiLlamaAPI.getHistoricalPrice(new Date(day), [
        "ethereum:0xba100000625a3754423978a60c9317c58a424e3d",
      ]);

      const entries = Object.entries(prices.coins);

      // Save prices to the tokenPrices table
      await addToTable(
        tokenPrices,
        entries.map((entry) => ({
          tokenAddress: entry[0].split(":")[1],
          priceUSD: entry[1].price,
          timestamp: utcMidnightTimestampOfCurrentDay,
          networkSlug: entry[0].split(":")[0],
        })),
      );

      console.log(`Fetched prices for tokens on ${day}:`, prices);
    }
  } catch (e) {
    // @ts-ignore
    console.error(`Failed to fetch prices: ${e.message}`);
  }
}

export async function runETLs() {
  logIfVerbose("Starting ETL processes");

  await seedNetworks();
  await seedVebalRounds();
  await ETLPools();
  await ETLSnapshots();
  await ETLGauges();
  await seedBalEmission();
  await fetchBalPrices();
  await ETLGaugesSnapshot();
  await calculateApr();
  logIfVerbose("Ended ETL processes");
  process.exit(0);
}

runETLs();
