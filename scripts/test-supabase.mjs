import assert from "node:assert/strict";
import {
  getSupabaseClient,
  saveReportToSupabase,
  fetchReportFromSupabase,
  saveSnapshotToSupabase,
  fetchSnapshotFromSupabase,
} from "../src/supabase.mjs";

console.log("Running Supabase integration unit tests...");

// Test 1: getSupabaseClient returns null when environment variables are missing
{
  const client = getSupabaseClient({});
  assert.equal(client, null, "Should return null when SUPABASE_URL and SUPABASE_KEY are omitted");
}

// Test 2: getSupabaseClient instantiates client when SUPABASE_URL and SUPABASE_KEY are supplied
{
  const client = getSupabaseClient({
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.dummy",
  });
  assert.ok(client, "Should create client when credentials are provided");
}

// Test 3: Graceful fallback when unconfigured
{
  const savedReport = await saveReportToSupabase("current-report", { report_date: "2026-10-05" }, {});
  assert.equal(savedReport, false, "saveReportToSupabase should return false when unconfigured");

  const report = await fetchReportFromSupabase("current-report", {});
  assert.equal(report, null, "fetchReportFromSupabase should return null when unconfigured");

  const savedSnapshot = await saveSnapshotToSupabase("weather.json", { ok: true }, {});
  assert.equal(savedSnapshot, false, "saveSnapshotToSupabase should return false when unconfigured");

  const snapshot = await fetchSnapshotFromSupabase("weather.json", {});
  assert.equal(snapshot, null, "fetchSnapshotFromSupabase should return null when unconfigured");
}

console.log("all supabase tests passed");
