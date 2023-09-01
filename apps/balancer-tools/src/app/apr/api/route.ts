/* eslint-disable no-console */
import { NextRequest, NextResponse } from "next/server";

import { Pool, POOLS_WITH_LIVE_GAUGES } from "#/lib/balancer/gauges";
import { fetcher } from "#/utils/fetcher";

import {
  calculatePoolStats,
  PoolTypeEnum,
} from "../(utils)/calculatePoolStats";
import { Round } from "../(utils)/rounds";
import { unsafeNetworkIdFor } from "@bleu-balancer-tools/utils";

export const BASE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ??
  `https://${process.env.NEXT_PUBLIC_VERCEL_URL}`;

type Order = "asc" | "desc";

export interface PoolTokens {
  address: string;
  logoURI: string;
  symbol: string;
  weight: string | null;
}

export interface PoolStats {
  apr: {
    total: number;
    breakdown: {
      veBAL: number;
    };
  };
  balPriceUSD: number;
  tvl: number;
  votingShare: number;
}

type PoolStatsWithoutVotingShare = Omit<PoolStats, "votingShare">;

export interface PoolStatsData extends PoolStats {
  symbol: string;
  network: string;
  poolId: string;
  roundId: number;
  tokens: PoolTokens[];
  type: keyof typeof PoolTypeEnum;
}

export interface PoolStatsResults {
  perRound: PoolStatsData[];
  average: PoolStatsWithoutVotingShare;
}

const memoryCache: { [key: string]: unknown } = {};

const getDataFromCacheOrCompute = async <T>(
  cacheKey: string,
  computeFn: () => Promise<T>,
): Promise<T> => {
  if (memoryCache[cacheKey]) {
    console.debug(`Cache hit for ${cacheKey}`);
    return memoryCache[cacheKey] as T;
  }

  console.debug(`Cache miss for ${cacheKey}`);
  const computedData = await computeFn();
  memoryCache[cacheKey] = computedData;
  return computedData;
};

const computeAverages = (
  poolData: PoolStatsData[],
): PoolStatsWithoutVotingShare => {
  const total = poolData.reduce(
    (acc, data) => ({
      apr: {
        total: acc.apr.total + data.apr.total,
        breakdown: {
          veBAL: acc.apr.breakdown.veBAL + data.apr.breakdown.veBAL,
        },
      },
      balPriceUSD: acc.balPriceUSD + data.balPriceUSD,
      tvl: acc.tvl + data.tvl,
    }),
    {
      apr: { total: 0, breakdown: { veBAL: 0 } },
      balPriceUSD: 0,
      tvl: 0,
    },
  );

  const count = poolData.length;
  return {
    apr: {
      total: total.apr.total / count,
      breakdown: {
        veBAL: total.apr.breakdown.veBAL / count,
      },
    },
    balPriceUSD: total.balPriceUSD / count,
    tvl: total.tvl / count,
  };
};

const fetchDataForPoolId = async (
  poolId: string,
): Promise<PoolStatsResults> => {
  const pool = new Pool(poolId);
  const gaugeAddedDate = new Date(pool.gauge.addedTimestamp * 1000);
  const roundGaugeAdded = Round.getRoundByDate(gaugeAddedDate);
  const promises = Array.from(
    {
      length:
        parseInt(Round.currentRound().value) -
        parseInt(roundGaugeAdded.value) +
        1,
    },
    (_, index) =>
      fetcher<PoolStatsResults>(
        `${BASE_URL}/apr/api?roundId=${
          index + parseInt(roundGaugeAdded.value)
        }&poolId=${poolId}`,
      ),
  );

  const gaugesData = await Promise.allSettled(promises);

  const resolvedPoolData = gaugesData
    .filter(
      (result): result is PromiseFulfilledResult<PoolStatsResults> =>
        result.status === "fulfilled",
    )
    .map((result) => result.value.perRound)
    .flat();

  const average = computeAverages(resolvedPoolData);

  return {
    perRound: resolvedPoolData,
    average,
  };
};

const MAX_RETRIES = 3; // specify the number of retry attempts
const RETRY_DELAY = 1000; // delay between retries in milliseconds

const fetchDataForPoolIdRoundId = async (poolId: string, roundId: string) => {
  let attempts = 0;

  while (attempts < MAX_RETRIES) {
    try {
      const data: PoolStatsData | null = await calculatePoolStats({
        roundId,
        poolId,
      });

      if (!data) {
        return {
          perRound: [],
          average: {
            apr: 0,
            balPriceUSD: 0,
            tvl: 0,
          },
        };
      }

      return {
        perRound: [data],
        average: [computeAverages([data])],
      };
    } catch (error) {
      attempts++;
      console.error(
        `Attempt ${attempts} - Error fetching data for pool ${poolId} and round ${roundId}:`,
        error,
      );

      if (attempts >= MAX_RETRIES) {
        console.error("Max retries reached. Giving up fetching data.");
        return null;
      }

      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY)); // Delay before retrying
    }
  }
};

const fetchDataForRoundId = async (
  roundId: string,
): Promise<PoolStatsResults> => {
  const existingPoolsInRound = POOLS_WITH_LIVE_GAUGES.filter(
    ({ gauge: { addedTimestamp } }) =>
      addedTimestamp &&
      Round.getRoundByDate(new Date(addedTimestamp * 1000)).value <= roundId,
  );

  const gaugesData = await Promise.allSettled(
    existingPoolsInRound.map(({ id: poolId }) =>
      fetcher<PoolStatsResults>(
        `${BASE_URL}/apr/api?roundId=${roundId}&poolId=${poolId}`,
      ),
    ),
  );

  const resolvedPoolData = gaugesData
    .filter(
      (result): result is PromiseFulfilledResult<PoolStatsResults> =>
        result.status === "fulfilled",
    )
    .map((result) => result.value.perRound)
    .flat();

  const average = computeAverages(resolvedPoolData);

  return {
    perRound: resolvedPoolData,
    average,
  };
};

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  const poolId = searchParams.get("poolId");
  const roundId = searchParams.get("roundId");
  const sort = (searchParams.get("sort") as keyof PoolStatsData) || "apr";
  const order = (searchParams.get("order") as Order) || "desc";
  const limit = parseInt(searchParams.get("limit") ?? "0") || Infinity;
  const offset = parseInt(searchParams.get("offset") ?? "0");

  let responseData;

  if (poolId && roundId) {
    return NextResponse.json(
      await getDataFromCacheOrCompute(
        `pool_${poolId}_round_${roundId}`,
        async () => fetchDataForPoolIdRoundId(poolId, roundId),
      ),
    );
  } else if (poolId) {
    responseData = await getDataFromCacheOrCompute(
      `fetch_pool_id_${poolId}`,
      async () => fetchDataForPoolId(poolId),
    );
  } else if (roundId) {
    responseData = await getDataFromCacheOrCompute(
      `fetch_round_id_${roundId}`,
      async () => fetchDataForRoundId(roundId),
    );
  } else {
    return NextResponse.json({ error: "no roundId or poolId provided" });
  }

  if (responseData === null) {
    return NextResponse.json({ error: "error fetching data" });
  }

  return NextResponse.json(
    sortAndLimit(
      filterPoolStats(responseData, searchParams),
      sort,
      order,
      offset,
      limit,
    ),
  );
}

function filterPoolStats(
  poolStats: PoolStatsResults,
  searchParams: URLSearchParams,
): PoolStatsResults {
  let filteredData = [...poolStats.perRound];

  const network = searchParams.get("network");
  const minApr = parseFloat(searchParams.get("minApr") ?? "0");
  const maxApr = parseFloat(searchParams.get("maxApr") ?? "Infinity");
  const minVotingShare = parseFloat(searchParams.get("minVotingShare") ?? "0");
  const maxVotingShare = parseFloat(
    searchParams.get("maxVotingShare") ?? "Infinity",
  );
  const tokenSymbol = searchParams.get("tokens");
  const poolTypes = searchParams.get("types");
  const minTvl = parseFloat(searchParams.get("minTvl") ?? "0");
  const maxTvl = parseFloat(searchParams.get("maxTvl") ?? "Infinity");

  if (network) {
    const decodedNetworks = network
      .split(",")
      .map((network) => unsafeNetworkIdFor(network.toLowerCase()));
    filteredData = filteredData.filter((pool) =>
      decodedNetworks.includes(pool.network),
    );
  }
  if (minApr || maxApr) {
    filteredData = filteredData.filter(
      (pool) => pool.apr.total >= minApr && pool.apr.total <= maxApr,
    );
  }
  if (minVotingShare || maxVotingShare) {
    filteredData = filteredData.filter(
      (pool) =>
        pool.votingShare * 100 >= minVotingShare &&
        pool.votingShare * 100 <= maxVotingShare,
    );
  }
  if (tokenSymbol) {
    const decodedSymbols = tokenSymbol.split(",").map(decodeURIComponent);
    filteredData = filteredData.filter((pool) =>
      pool.tokens.some((token) => decodedSymbols.includes(token.symbol)),
    );
  }
  if (poolTypes) {
    const decodedSymbols = poolTypes.split(",").map(decodeURIComponent);
    filteredData = filteredData.filter((pool) =>
      decodedSymbols.includes(pool.type),
    );
  }
  if (minTvl || maxTvl) {
    filteredData = filteredData.filter(
      (pool) => pool.tvl >= minTvl && pool.tvl <= maxTvl,
    );
  }

  return {
    ...poolStats,
    perRound: filteredData,
  };
}

function compareNumbers(a: number, b: number, order: Order): number {
  // Handle NaN values
  if (isNaN(a) && isNaN(b)) return 0;
  if (isNaN(a)) return 1;
  if (isNaN(b)) return -1;

  return order === "asc" ? a - b : b - a;
}

function compareStrings(a: string, b: string, order: Order): number {
  return order === "asc" ? a.localeCompare(b) : b.localeCompare(a);
}

function sortAndLimit(
  poolStatsResults: PoolStatsResults,
  sortProperty: keyof PoolStatsData = "apr",
  order: Order = "desc",
  offset: number = 0,
  limit: number = Infinity,
) {
  const sortedEntries = poolStatsResults.perRound
    .sort((aValue, bValue) => {
      let valueA = aValue[sortProperty];
      let valueB = bValue[sortProperty];

      if (sortProperty === "apr") {
        valueA = (valueA as (typeof aValue)["apr"]).total;
        valueB = (valueB as (typeof bValue)["apr"]).total;
      }

      if (valueA == null || Number.isNaN(valueA)) return 1;
      if (valueB == null || Number.isNaN(valueB)) return -1;

      if (typeof valueA === "number" && typeof valueB === "number") {
        return compareNumbers(valueA, valueB, order);
      } else {
        return compareStrings(valueA.toString(), valueB.toString(), order);
      }
    })
    .slice(offset, offset + limit);

  return {
    perRound: sortedEntries,
    average: poolStatsResults.average,
  };
}
