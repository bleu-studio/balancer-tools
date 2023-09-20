import { calculatePoolData } from "../../(utils)/calculatePoolStats";
import {
  PoolStats,
  PoolStatsData,
  PoolStatsWithoutVotingShareAndCollectedFees,
  tokenAPR,
} from "../route";

export const computeAverages = (formattedPoolData: {
  [key: string]: PoolStatsData[] | calculatePoolData[];
}): PoolStatsWithoutVotingShareAndCollectedFees => {
  const averages: PoolStatsWithoutVotingShareAndCollectedFees =
    initializeAverages();
  const poolAverage: { [key: string]: PoolStatsData | calculatePoolData } = {};

  const uniqueTokenEntries: {
    [key: string]: { idx: number; occurences: number };
  } = {};

  let totalDataCount = 0;

  for (const key in formattedPoolData) {
    if (Object.hasOwnProperty.call(formattedPoolData, key)) {
      const dataArr = formattedPoolData[key];
      dataArr.forEach((data) => {
        accumulateData(averages, data);
        accumulateTokens(
          averages.apr.breakdown.tokens,
          data.apr.breakdown.tokens,
          uniqueTokenEntries,
        );
        totalDataCount++;

        if (data.poolId in poolAverage) {
          poolAverage[data.poolId] = accumulateData(
            // @ts-ignore  - Need help with this typing!
            poolAverage[data.poolId],
            data,
          );
        } else {
          poolAverage[data.poolId] = data;
        }
      });
    }
  }

  if (totalDataCount > 0) {
    calculateAverages(averages, totalDataCount, uniqueTokenEntries);
    CalculateAveragesForPool(
      poolAverage,
      Object.keys(formattedPoolData).length,
      averages.poolAverage,
    );
  }

  return averages;
};

function CalculateAveragesForPool(
  poolAverage: { [key: string]: PoolStatsData | calculatePoolData },
  divisor: number,
  output: PoolStatsData[] | calculatePoolData[],
) {
  for (const key in poolAverage) {
    if (poolAverage.hasOwnProperty(key)) {
      if (typeof poolAverage[key] === "object" && poolAverage[key] !== null) {
        // Check if the value is an object and not null
        const poolStatsData = poolAverage[key];
        const dividedStatsData = {} as PoolStatsData;

        for (const subKey in poolStatsData) {
          if (poolStatsData.hasOwnProperty(subKey)) {
            if (
              typeof poolStatsData[subKey as keyof PoolStatsData] === "number"
            ) {
              //@ts-ignore  - Need help with this typing!
              dividedStatsData[subKey] = poolStatsData[subKey] / divisor;
            } else {
              //@ts-ignore  - Need help with this typing!
              dividedStatsData[subKey] = poolStatsData[subKey];
            }
          }
        }

        output.push(dividedStatsData);
      }
    }
  }
}

function initializeAverages(): PoolStatsWithoutVotingShareAndCollectedFees {
  return {
    poolAverage: [],
    apr: {
      total: 0,
      breakdown: {
        veBAL: 0,
        swapFee: 0,
        tokens: {
          total: 0,
          breakdown: [],
        },
      },
    },
    balPriceUSD: 0,
    tvl: 0,
    volume: 0,
  };
}

function accumulateData(
  obj1: PoolStatsWithoutVotingShareAndCollectedFees,
  obj2: PoolStatsData | calculatePoolData,
): PoolStatsData {
  const result = { ...obj1 };

  for (const key in obj2) {
    if (obj2.hasOwnProperty(key) && obj1.hasOwnProperty(key)) {
      // @ts-ignore  - Need help with this typing!
      if (typeof obj1[key] === "string" && typeof obj2[key] === "string") {
        continue;
        // @ts-ignore  - Need help with this typing!
      } else if (
        typeof obj1[key] === "object" &&
        typeof obj2[key] === "object"
      ) {
        // @ts-ignore  - Need help with this typing!
        result[key] = accumulateData(obj1[key], obj2[key]);
      } else {
        // @ts-ignore  - Need help with this typing!
        result[key] = obj1[key] + obj2[key];
      }
    } else {
      // @ts-ignore  - Need help with this typing!
      result[key] = obj2[key];
    }
  }

  // @ts-ignore  - Need help with this typing!
  return result;
}

function accumulateTokens(
  targetTokens: { total: number; breakdown: tokenAPR[] },
  sourceTokens: { total: number; breakdown: tokenAPR[] },
  uniqueEntries: { [key: string]: { idx: number; occurences: number } },
): void {
  sourceTokens.breakdown.forEach((tokenData) => {
    if (!uniqueEntries[tokenData.symbol]) {
      uniqueEntries[tokenData.symbol] = {
        idx: targetTokens.breakdown.length,
        occurences: 0,
      };
      targetTokens.breakdown.push(tokenData);
    } else {
      uniqueEntries[tokenData.symbol].occurences++;
      const existingTokenData =
        targetTokens.breakdown[uniqueEntries[tokenData.symbol].idx];
      existingTokenData.yield += tokenData.yield;
    }
  });
}

function accumulateOtherMetrics(
  target: PoolStatsWithoutVotingShareAndCollectedFees,
  source: PoolStats | calculatePoolData,
): void {
  target.balPriceUSD += source.balPriceUSD;
  target.tvl += source.tvl;
  target.volume += source.volume;
}

function calculateAverages(
  averages: PoolStatsWithoutVotingShareAndCollectedFees,
  totalDataCount: number,
  uniqueEntries: { [key: string]: { idx: number; occurences: number } },
): void {
  averages.apr.total /= totalDataCount;
  averages.apr.breakdown.veBAL /= totalDataCount;
  averages.apr.breakdown.swapFee /= totalDataCount;
  averages.balPriceUSD /= totalDataCount;
  averages.tvl /= totalDataCount;
  averages.volume /= totalDataCount;

  averages.apr.breakdown.tokens.breakdown.forEach((tokenData) => {
    tokenData.yield /= uniqueEntries[tokenData.symbol].occurences;
  });
}
