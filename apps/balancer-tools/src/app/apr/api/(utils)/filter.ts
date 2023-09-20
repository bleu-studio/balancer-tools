import { z } from "zod";

import { PoolStatsData, PoolStatsResults } from "../route";
import { QueryParamsSchema } from "./validate";

export function filterPoolStats(
  poolStats: PoolStatsResults,
  searchParams: URLSearchParams,
) {
  // TODO: ensure this is working as it should
  try {
    const parsedParams = QueryParamsSchema.parse(
      Object.fromEntries(searchParams),
    );
    const filteredData = Object.fromEntries(
      Object.entries(poolStats.perDay)
        .map(([date, poolOnDate]) => [
          date,
          Array.isArray(poolOnDate)
            ? poolOnDate.filter((pool) => shouldIncludePool(pool, parsedParams))
            : shouldIncludePool(poolOnDate, parsedParams)
            ? poolOnDate
            : null,
        ])
        .filter(([, value]) => value !== null),
    );
    const filteredPoolAverage = poolStats.average.poolAverage.filter(
      (poolOnDate) => shouldIncludePool(poolOnDate, parsedParams),
    );

    return {
      ...poolStats,
      perDay: filteredData,
      average: { ...poolStats.average, poolAverage: filteredPoolAverage },
    };
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn("Error sorting for params", searchParams);
    // eslint-disable-next-line no-console
    console.warn(error);
    return poolStats;
  }
}
type QueryParams = z.infer<typeof QueryParamsSchema>;

type FilterFunc<T> = (pool: PoolStatsData, value: T) => boolean;

type ConditionTypes = {
  [K in keyof QueryParams]?: FilterFunc<QueryParams[K]>;
};

const conditions: ConditionTypes = {
  network: (pool, value) => pool.network === value,
  minApr: (pool, value) => pool.apr.total >= value!,
  maxApr: (pool, value) => pool.apr.total <= value!,
  minVotingShare: (pool, value) => pool.votingShare * 100 >= value!,
  maxVotingShare: (pool, value) => pool.votingShare * 100 <= value!,
  tokens: (pool, value) =>
    pool.tokens.some((token) => value!.includes(token.symbol)),
  types: (pool, value) => value!.includes(pool.type),
  minTvl: (pool, value) => pool.tvl >= value!,
  maxTvl: (pool, value) => pool.tvl <= value!,
};

function shouldIncludePool(pool: PoolStatsData, params: QueryParams) {
  return Object.entries(params)
    .filter(([, value]) => value !== null && value !== undefined)
    .every(([key, value]) => {
      const condition = conditions[key as keyof QueryParams];
      return condition ? condition(pool, value as never) : true;
    });
}
