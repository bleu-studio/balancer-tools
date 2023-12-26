import { vebalRounds } from "../../../db/schema";
import { addToTable, logIfVerbose } from "../../../index";

export async function loadVebalRounds() {
  logIfVerbose("Loading veBAL rounds");

  const startDate = new Date("2022-04-14T00:00:00.000Z");
  let roundNumber = 1;
  const roundsToInsert = [];

  while (startDate <= new Date()) {
    const endDate = new Date(startDate);
    endDate.setUTCDate(endDate.getUTCDate() + 6);
    endDate.setUTCHours(23, 59, 59, 999);

    // Add round data to the array
    roundsToInsert.push({
      startDate: new Date(startDate),
      endDate: endDate,
      roundNumber: roundNumber,
    });

    startDate.setUTCDate(startDate.getUTCDate() + 7);
    roundNumber++;
  }

  await addToTable(vebalRounds, roundsToInsert);
}