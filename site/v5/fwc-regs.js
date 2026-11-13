// Recreational regulations for Atlantic (Flagler County) waters, transcribed from the FWC species
// pages on 2026-11-13. This is a dated snapshot, not a live feed: rules change, so the UI always
// shows the date and links to the FWC page. Region notes: red drum and spotted seatrout use the
// "Northeast" management region (Georgia line to New Smyrna Beach), which includes Flagler.
export const FWC_REGS_ASOF = "2026-11-13";
const YEAR_ROUND = "Open year-round";
const UNREG = { size: "No species size limit", bag: "Default: 2 fish or 100 lb per person per day, whichever is more", season: "No closed season", area: "Statewide default for unregulated species" };

export const FWC_REGS = {
  redfish: { size: "Slot: 18–27″ total length", bag: "1 per person per day (4 per vessel)", season: YEAR_ROUND, area: "Northeast region" },
  trout: { size: "Slot: 15–19″ total length", bag: "3 per person per day", season: YEAR_ROUND, area: "Northeast region", note: "May not possess a fish over 19″." },
  flounder: { size: "Minimum 14″ total length", bag: "5 per person per day", season: "Closed Oct 15–Nov 30", area: "State and federal waters" },
  sheepshead: { size: "Minimum 12″ total length", bag: "8 per person per day", season: YEAR_ROUND, area: "Atlantic and Gulf state waters", note: "Vessel limit of 50 per trip in March and April." },
  blackdrum: { size: "Slot: 14–24″ (one fish over 24″ allowed)", bag: "5 per person per day", season: YEAR_ROUND, area: "Atlantic and Gulf state waters" },
  bluefish: { size: "Minimum 12″ fork length", bag: "3 per person per day", season: "No closed season listed", area: "Atlantic state waters (Nassau–Miami-Dade)" },
  spanish: { size: "Minimum 12″ fork length", bag: "15 per person per day", season: YEAR_ROUND, area: "Atlantic and Gulf state waters" },
  mangrove: { size: "Minimum 10″ total length (federal waters 12″)", bag: "5 per person per day, within the 10-snapper aggregate", season: YEAR_ROUND, area: "Atlantic state waters" },
  pompano: { size: "Minimum 11″ fork length", bag: "6 per person per day", season: YEAR_ROUND, area: "State and federal waters" },
  seabass: { size: "Minimum 13″ total length", bag: "7 per person per day", season: "No closed season listed", area: "Atlantic state waters" },
  spot: { size: "No minimum size", bag: "50 per person per day, per species", season: YEAR_ROUND, area: "Atlantic state waters (Nassau–Miami-Dade)" },
  croaker: { size: "No minimum size", bag: "50 per person per day, per species", season: YEAR_ROUND, area: "Atlantic state waters (Nassau–Miami-Dade)" },
  whitetrout: { size: "No minimum size", bag: "100 lb per person per day", season: "No closed season listed", area: "State waters outside the Nassau weakfish zone", note: "Sand seatrout fall under the weakfish rules." },
  "sharks-rays": { size: "Harvestable sharks only: none for 8 smaller species, 54″ fork length for 7 larger species", bag: "1 shark per person per day (2 per vessel)", season: "No closed season listed", area: "State waters", note: "Many sharks are prohibited. From shore, the Shore-based Shark Fishing permit and course are required." },
  whiting: UNREG, jack: UNREG, spadefish: UNREG, catfish: UNREG, "panfish-misc": UNREG,
};
