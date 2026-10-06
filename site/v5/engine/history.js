/**
 * History interface for A3. The repaired artifact currently has:
 *   history.ocean | history.inland -> all and by_month["1".."12"] slices;
 *   each slice: n, nTrips, imputed_proxy_n, p_any_fish, species;
 *   species[MRIP_NAME]: p, hitTrips, nTrips, hitTripsIncludingImputedProxy;
 *   water_temp.by_day_of_year["1".."365"]: mean_f, p10_f, p90_f, n_days.
 * `n` is the unique non-proxy interview denominator. Surf and pier map to ocean;
 * inshore maps to inland. County/site/year slices are diagnostic and do not predict.
 * No rates are inferred from omitted slices, zero denominators, or proxy-inclusive fields.
 *
 * A3 will implement these signatures from the immutable JSON artifact. This module is
 * intentionally only an interface in A1.
 */

export class NotImplemented extends Error {
  constructor(operation) {
    super(`history.${operation} is an A1 interface stub; implement the history math in A3`);
    this.name = "NotImplemented";
  }
}

/** @typedef {"surf"|"pier"|"inshore"} FishingMode */
/** @typedef {{n:number,imputed_proxy_n:number,p_any_fish:number,species:Record<string,{p:number,hitTrips:number,nTrips:number}>}} HistorySlice */
/** @typedef {{ocean:{all:HistorySlice,by_month:Record<string,HistorySlice>},inland:{all:HistorySlice,by_month:Record<string,HistorySlice>},water_temp:{by_day_of_year:Record<string,{mean_f:number,p10_f:number,p90_f:number,n_days:number}>}}} FirstCoastHistory */
/** @typedef {{rate:number|null,n:number|null,lowSample:boolean,band:string|null,unit:"trips",month:number,sourceLabel:string}} HistoricalRate */

/** @param {{readJson:(path:string)=>Promise<FirstCoastHistory>, path?:string}} _options Defaults to `site/v5/data/first-coast-history.json`. */
export async function loadFirstCoastHistory(_options) { throw new NotImplemented("loadFirstCoastHistory"); }
/** @param {FirstCoastHistory} _history @param {{speciesId:string,mripAliases:string[],mode:FishingMode,month:number}} _query @returns {HistoricalRate} */
export function getSpeciesMonthRate(_history,_query) { throw new NotImplemented("getSpeciesMonthRate"); }
/** @param {FirstCoastHistory} _history @param {{speciesId:string,mripAliases:string[],mode:FishingMode,month:number}} _query */
export function getShrunkSpeciesMonthRate(_history,_query) { throw new NotImplemented("getShrunkSpeciesMonthRate"); }
/** @param {FirstCoastHistory} _history @param {{speciesId:string,mripAliases:string[],mode:FishingMode}} _query @returns {(number|null)[]} */
export function getSeasonCurve(_history,_query) { throw new NotImplemented("getSeasonCurve"); }
/** @param {{start:string,end:string,mode:FishingMode}} _window UTC half-open interval */
export function getHistoricalTiming(_history,_query) { throw new NotImplemented("getHistoricalTiming"); }
