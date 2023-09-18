/* eslint-disable no-console */
import { NextRequest, NextResponse } from "next/server";

import { getDataFromCacheOrCompute } from "#/lib/cache";

import { PoolTypeEnum } from "../(utils)/calculatePoolStats";
import { fetchDataForPoolId } from "./(utils)/fetchDataForPoolId";
import { fetchDataForPoolIdDateRange } from "./(utils)/fetchDataForPoolIdDateRange";
import { fetchDataForDateRange } from "./(utils)/fetchForDateRange";
import { sortAndLimit } from "./(utils)/sort";
import { QueryParamsSchema } from "./(utils)/validate";

export const BASE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ??
  `https://${process.env.NEXT_PUBLIC_VERCEL_URL}`;

export interface tokenAPR {
  address: string;
  symbol: string;
  yield: number;
}
export interface PoolTokens {
  percentageValue?: number;
  price?: number;
  address: string;
  logoSrc: string;
  symbol: string;
  weight: string | null;
  balance?: number;
}

export interface PoolStats {
  apr: {
    total: number;
    breakdown: {
      veBAL: number;
      swapFee: number;
      tokens: {
        total: number;
        breakdown: tokenAPR[];
      };
    };
  };
  balPriceUSD: number;
  volume: number;
  tvl: number;
  votingShare: number;
  collectedFeesUSD: number;
}

export type PoolStatsWithoutVotingShareAndCollectedFees = Omit<
  PoolStats,
  "votingShare" | "collectedFeesUSD"
>;

export interface PoolStatsData extends PoolStats {
  symbol: string;
  network: string;
  poolId: string;
  roundId: number;
  tokens: PoolTokens[];
  type: keyof typeof PoolTypeEnum;
}

export interface PoolStatsResults {
  perDay: { [key: string]: PoolStatsData[] };
  average: PoolStatsWithoutVotingShareAndCollectedFees;
}

function valuesFromSearchParams(searchParams: URLSearchParams) {
  return Array.from(searchParams.keys()).reduce(
    (values, key) => ({
      ...values,
      [key]: searchParams.getAll(key)[0],
    }),
    {} as Record<string, Array<string> | string>,
  );
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const parsedParams = QueryParamsSchema.safeParse(
    valuesFromSearchParams(searchParams),
  );

  if (!parsedParams.success) {
    console.log(searchParams);

    return NextResponse.json(
      { error: "Invalid query parameters", details: parsedParams.error.issues },
      { status: 400 },
    );
  }

  const {
    poolId,
    startAt,
    endAt,
    sort = "apr",
    order = "desc",
    limit = Infinity,
    offset = 0,
  } = parsedParams.data;
  let responseData;

  if (poolId && startAt && endAt) {
    return NextResponse.json(
      await getDataFromCacheOrCompute(
        `pool_${poolId}_round_${startAt}_${endAt}`,
        async () => fetchDataForPoolIdDateRange(poolId, startAt, endAt),
      ),
    );
  } else if (poolId) {
    responseData = await getDataFromCacheOrCompute(
      `fetch_pool_id_${poolId}`,
      async () => fetchDataForPoolId(poolId),
    );
  } else if (startAt && endAt) {
    responseData = await getDataFromCacheOrCompute(
      `fetch_round_id_${startAt}_${endAt}`,
      async () => fetchDataForDateRange(startAt, endAt),
    );
  }

  if (responseData === null || !responseData) {
    return NextResponse.json(
      { error: "error fetching data", poolId, startAt, endAt },
      { status: 400 },
    );
  }

  return NextResponse.json(
    sortAndLimit(
      // @ts-ignore
      filterPoolStats(responseData, searchParams),
      sort,
      order,
      offset,
      limit,
    ),
  );
}
