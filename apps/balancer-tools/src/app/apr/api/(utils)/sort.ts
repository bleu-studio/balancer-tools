import { PoolStatsData, PoolStatsResults } from "../route";

export enum Order {
  Asc = "asc",
  Desc = "desc",
}

function compareNumbers(a: number, b: number): number {
  return a - b;
}

function compareStrings(a: string, b: string): number {
  return a.localeCompare(b);
}

function createSortFunction(
  sortProperty: keyof PoolStatsData,
  order: Order,
): (a: PoolStatsData, b: PoolStatsData) => number {
  return (a, b) => {
    let valueA = a[sortProperty];
    let valueB = b[sortProperty];

    if (sortProperty === "apr") {
      valueA = a.apr.total;
      valueB = b.apr.total;
    }

    if (valueA == null || Number.isNaN(valueA)) return 1;
    if (valueB == null || Number.isNaN(valueB)) return -1;

    if (typeof valueA === "number" && typeof valueB === "number") {
      return compareNumbers(valueA, valueB) * (order === Order.Asc ? 1 : -1);
    } else {
      return (
        compareStrings(valueA.toString(), valueB.toString()) *
        (order === Order.Asc ? 1 : -1)
      );
    }
  };
}

export function sortAndLimit(
  poolStatsResults: { [key: string]: PoolStatsData[] },
  sortProperty: keyof PoolStatsData = "apr",
  order: Order = Order.Desc,
  offset: number = 0,
  limit: number = Infinity,
): { [key: string]: PoolStatsData[] } {
  const sortedData: { [key: string]: PoolStatsData[] } = {};

  for (const date in poolStatsResults) {
    const dayData = poolStatsResults[date];
    const sortFunction = createSortFunction(sortProperty, order);

    const sortedEntries = dayData
      .sort(sortFunction)
      .slice(offset, offset + limit);

    sortedData[date] = sortedEntries;
  }

  return sortedData;
}
