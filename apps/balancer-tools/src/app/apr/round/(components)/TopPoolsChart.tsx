"use client";

import { networkFor } from "@bleu-balancer-tools/utils";
import { greenDarkA } from "@radix-ui/colors";
import { useRouter } from "next/navigation";
import { Data, PlotMouseEvent, PlotType } from "plotly.js";

import Plot from "#/components/Plot";

import { PoolStatsResults, formatDateToMMDDYYYY } from "../../api/route";

export default function TopPoolsChart({
  startAt,
  endAt,
  ApiResult,
}: {
  startAt: Date;
  endAt: Date;
  ApiResult: PoolStatsResults;
}) {
  const shades = Object.values(greenDarkA).map((color) => color.toString());
  const colors = [...shades.slice(4, 10).reverse(), ...shades.slice(4, 10)];
  const selectedDate = ApiResult.perDay[formatDateToMMDDYYYY(endAt)] 
  const yAxisLabels = selectedDate
    .filter((pool) => pool.apr.total > 0)
    .map((result) => [
      result.tokens
        .map(
          (t) =>
            `${t.symbol}${
              t.weight ? `-${(parseFloat(t.weight) * 100).toFixed()}%` : ""
            }`,
        )
        .join(" "),
      `${result.apr.total.toFixed()}% APR`,
    ]);

  const longestyAxisLabelLength = Math.max(
    ...yAxisLabels.map(
      ([tokenNames, aprLabel]) => tokenNames.length + aprLabel.length,
    ),
  );

  const paddedYAxisLabels = yAxisLabels.map(([tokenNames, aprValue]) =>
    [
      tokenNames.padEnd(longestyAxisLabelLength - aprValue.length, " "),
      aprValue,
    ].join(" "),
  );

  const chartData: Data = {
    hoverinfo: "none",
    marker: {
      color: selectedDate.map(
        (_, index) => colors[index % colors.length],
      ),
    },
    orientation: "h" as const,
    type: "bar" as PlotType,
    x: selectedDate.map((result) => result.apr.total.toFixed(2)),
    y: paddedYAxisLabels,
  };

  const router = useRouter();
  function onClickHandler(event: PlotMouseEvent) {
    const clickedRoundData = selectedDate[event.points[0].pointIndex];
    const poolRedirectURL = `/apr/pool/${networkFor(clickedRoundData.network)}/${clickedRoundData.poolId}/?startAt=${formatDateToMMDDYYYY(startAt)}&endAt=${formatDateToMMDDYYYY(endAt)}`;
    router.push(poolRedirectURL);
  }

  return (
    <div className="flex justify-between border border-blue6 bg-blue3 rounded p-4 cursor-pointer">
      <Plot
        onClick={onClickHandler}
        title={`Top APR Pools of Round ${formatDateToMMDDYYYY(startAt)} - ${formatDateToMMDDYYYY(endAt)}`}
        toolTip="Top pools with highest APR."
        data={[chartData]}
        hovermode={false}
        config={{ displayModeBar: false }}
        layout={{
          showlegend: false,
          barmode: "overlay",
          autosize: true,
          dragmode: false,
          margin: { t: 30, r: 20, l: 20, b: 30 },
          font: {
            family: "monospace",
          },
          xaxis: {
            title: `APR %`,
            fixedrange: true,
            type: "log",
          },
          yaxis: {
            fixedrange: true,
            autorange: "reversed",
            position: 0,
            side: "right",
            // @ts-ignore: 2322
            tickson: "boundaries",
          },
        }}
      />
    </div>
  );
}
