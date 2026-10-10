import { SPOTS } from "../spots.js";

export function isModeClosed(spotId, mode, spots = SPOTS) {
  return !!spots.find((spot) => spot.id === spotId)?.closures?.some((closure) => closure.status === "closed" && closure.modes?.includes(mode));
}

export function openModes(spotId, modes = [], spots = SPOTS) {
  return modes.filter((mode) => !isModeClosed(spotId, mode, spots));
}

export function openModeRows(rows = [], spots = SPOTS) {
  return rows.filter((row) => !isModeClosed(row.locationId, row.mode, spots));
}
