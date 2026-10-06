import { createClient } from "@supabase/supabase-js";

/**
 * Returns a Supabase client if SUPABASE_URL and SUPABASE_KEY (or SUPABASE_SERVICE_ROLE_KEY) are configured.
 * @param {Record<string, any>} [env]
 * @returns {import('@supabase/supabase-js').SupabaseClient | null}
 */
export function getSupabaseClient(env = {}) {
  const processEnv = typeof process !== "undefined" && process ? process.env : {};
  const url = env.SUPABASE_URL || processEnv.SUPABASE_URL;
  const key = env.SUPABASE_KEY || env.SUPABASE_SERVICE_ROLE_KEY || processEnv.SUPABASE_KEY || processEnv.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  try {
    return createClient(url, key, { auth: { persistSession: false } });
  } catch (error) {
    console.warn("[supabase] Client initialization error:", error instanceof Error ? error.message : error);
    return null;
  }
}

/**
 * Saves a generated report object to Supabase "reports" table.
 * Table schema expectation:
 *   reports (id TEXT PRIMARY KEY, key TEXT, report_date TEXT, generated_at TEXT, payload JSONB, updated_at TIMESTAMPTZ)
 */
export async function saveReportToSupabase(key, report, env = {}) {
  const supabase = getSupabaseClient(env);
  if (!supabase || !report) return false;
  try {
    const record = {
      key,
      report_date: report.report_date || null,
      generated_at: report.generated_at || new Date().toISOString(),
      payload: report,
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase
      .from("reports")
      .upsert(record, { onConflict: "key" });
    if (error) {
      console.warn(`[supabase] Failed to save report '${key}':`, error.message);
      return false;
    }
    return true;
  } catch (error) {
    console.warn(`[supabase] Exception saving report '${key}':`, error instanceof Error ? error.message : error);
    return false;
  }
}

/**
 * Fetches a report from Supabase "reports" table by key.
 */
export async function fetchReportFromSupabase(key, env = {}) {
  const supabase = getSupabaseClient(env);
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from("reports")
      .select("payload")
      .eq("key", key)
      .maybeSingle();
    if (error) {
      console.warn(`[supabase] Failed to fetch report '${key}':`, error.message);
      return null;
    }
    return data && data.payload ? data.payload : null;
  } catch (error) {
    console.warn(`[supabase] Exception fetching report '${key}':`, error instanceof Error ? error.message : error);
    return null;
  }
}

/**
 * Saves live endpoint snapshot data to Supabase "snapshots" table.
 * Table schema expectation:
 *   snapshots (endpoint TEXT PRIMARY KEY, payload JSONB, updated_at TIMESTAMPTZ)
 */
export async function saveSnapshotToSupabase(endpoint, payload, env = {}) {
  const supabase = getSupabaseClient(env);
  if (!supabase || !payload) return false;
  try {
    const record = {
      endpoint,
      payload: typeof payload === "string" ? JSON.parse(payload) : payload,
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase
      .from("snapshots")
      .upsert(record, { onConflict: "endpoint" });
    if (error) {
      console.warn(`[supabase] Failed to save snapshot '${endpoint}':`, error.message);
      return false;
    }
    return true;
  } catch (error) {
    console.warn(`[supabase] Exception saving snapshot '${endpoint}':`, error instanceof Error ? error.message : error);
    return false;
  }
}

/**
 * Fetches snapshot data from Supabase "snapshots" table by endpoint.
 */
export async function fetchSnapshotFromSupabase(endpoint, env = {}) {
  const supabase = getSupabaseClient(env);
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from("snapshots")
      .select("payload")
      .eq("endpoint", endpoint)
      .maybeSingle();
    if (error) {
      console.warn(`[supabase] Failed to fetch snapshot '${endpoint}':`, error.message);
      return null;
    }
    return data && data.payload ? data.payload : null;
  } catch (error) {
    console.warn(`[supabase] Exception fetching snapshot '${endpoint}':`, error instanceof Error ? error.message : error);
    return null;
  }
}
