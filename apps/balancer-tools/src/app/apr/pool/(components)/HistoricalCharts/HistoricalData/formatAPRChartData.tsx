import {
  blueDarkA,
  greenDarkA,
  violetDarkA,
  whiteA,
  yellowDarkA,
} from "@radix-ui/colors";
import { PlotType } from "plotly.js";

import { PoolStatsResults } from "#/app/apr/api/route";

import { generateAndTrimAprCords } from "..";

export default function formatAPRChartData(
  apiResult: PoolStatsResults,
  yaxis: string,
): Plotly.Data[] {
  const HOVERTEMPLATE = "%{y:.2f}%";
  const trimmedVebalAprData = generateAndTrimAprCords(
    apiResult.perDay,
    (result) => result[0].apr.breakdown.veBAL,
    0,
  );

  const trimmedFeeAprData = generateAndTrimAprCords(
    apiResult.perDay,
    (result) => result[0].apr.breakdown.swapFee,
    0,
  );

  const trimmedTokenTotalAprData = generateAndTrimAprCords(
    apiResult.perDay,
    (result) => result[0].apr.breakdown.tokens.total,
    0,
  );

  const trimmedRewardsTotalAprData = generateAndTrimAprCords(
    apiResult.perDay,
    (result) => result[0].apr.breakdown.rewards.total,
    0,
  );

  const trimmedTotalAprData = generateAndTrimAprCords(
    apiResult.perDay,
    (result) => result[0].apr.total,
    0,
  );
  const vebalAprPerRoundData = {
    name: "veBAL APR %",
    yaxis: yaxis,
    hovertemplate: HOVERTEMPLATE,
    x: trimmedVebalAprData.x,
    y: trimmedVebalAprData.y,
    line: { shape: "spline", color: blueDarkA.blueA9 } as const,
    type: "scatter" as PlotType,
  };

  const feeAprPerRoundData = {
    name: "Fee APR %",
    yaxis: yaxis,
    hovertemplate: HOVERTEMPLATE,
    x: trimmedFeeAprData.x,
    y: trimmedFeeAprData.y,
    line: { shape: "spline", color: greenDarkA.greenA9 } as const,
    type: "scatter" as PlotType,
  };

  const aprTokensTotalData = {
    name: `Tokens Yield APR %`,
    yaxis: yaxis,
    hovertemplate: HOVERTEMPLATE,
    x: trimmedTokenTotalAprData.x,
    y: trimmedTokenTotalAprData.y,
    line: { shape: "spline", color: violetDarkA.violetA9 } as const,
    type: "scatter" as PlotType,
  };

  const aprRewardsTotalData = {
    name: `Rewards APR %`,
    yaxis: yaxis,
    hovertemplate: HOVERTEMPLATE,
    x: trimmedRewardsTotalAprData.x,
    y: trimmedRewardsTotalAprData.y,
    line: { shape: "spline", color: yellowDarkA.yellowA9 } as const,
    type: "scatter" as PlotType,
  };

  const totalAprPerRoundData = {
    name: "Total APR %",
    yaxis: yaxis,
    hovertemplate: HOVERTEMPLATE,
    x: trimmedTotalAprData.x,
    y: trimmedTotalAprData.y,
    line: { shape: "spline", color: whiteA.whiteA9 } as const,
    type: "scatter" as PlotType,
  };

  const firstDay = Object.keys(apiResult.perDay)[0];
  const aprTokensData = apiResult.perDay[
    firstDay
  ][0].apr.breakdown.tokens.breakdown.map(({ symbol }, idx) => {
    const trimmedTokenAprData = generateAndTrimAprCords(
      apiResult.perDay,
      (result) => result[0].apr.breakdown.tokens.breakdown[idx].yield,
      0,
    );
    return {
      name: `${symbol} APR %`,
      yaxis: yaxis,
      showlegend: false,
      hovertemplate: HOVERTEMPLATE,
      x: trimmedTokenAprData.x,
      y: trimmedTokenAprData.y,
      line: { shape: "spline", color: "rgba(0,0,0,0);" } as const,
      type: "scatter" as PlotType,
    };
  });
  const aprRewardsData = apiResult.perDay[
    firstDay
  ][0].apr.breakdown.rewards.breakdown.map(({ symbol }, idx) => {
    const aprRewardsData = generateAndTrimAprCords(
      apiResult.perDay,
      (result) => result[0].apr.breakdown.rewards.breakdown[idx].value,
      0,
    );
    return {
      name: `${symbol} APR %`,
      yaxis: yaxis,
      showlegend: false,
      hovertemplate: HOVERTEMPLATE,
      x: aprRewardsData.x,
      y: aprRewardsData.y,
      line: { shape: "spline", color: "rgba(0,0,0,0);" } as const,
      type: "scatter" as PlotType,
    };
  });

  return [
    totalAprPerRoundData,
    vebalAprPerRoundData,
    feeAprPerRoundData,
    aprTokensTotalData,
    ...aprTokensData,
    aprRewardsTotalData,
    ...aprRewardsData,
  ];
}
