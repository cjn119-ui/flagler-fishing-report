const ACTIONS = new Set([
  "selectSpot", "selectSpecies", "horizon", "favorite", "refresh", "sample",
  "addCatch", "deleteCatch", "updateCatch", "point", "snapshot",
]);

// Keep unknown numeric values distinct from a measured zero at the native boundary.
export function nativeNullable(value) {
  return value == null || value === "" || (typeof value === "number" && !Number.isFinite(value)) ? null : value;
}

export function nativeHeadline(value, targetDate, todayDate, tomorrowDate) {
  if (typeof value !== "string" || !value || targetDate !== tomorrowDate || targetDate === todayDate) return value || null;
  return value.replace(/\btoday\b/gi, (word) => word[0] === "T" ? "Tomorrow" : word[0] === "t" ? "tomorrow" : "tomorrow");
}

export function nativeAfterHours(rec) {
  return rec?.state?.kind === "closed" || rec?.reason?.code === "noRemainingWindowsToday";
}

export function nativeDayAfterHours(day, now, timeZone = "America/New_York") {
  if (!day?.date || !Number.isFinite(now)) return false;
  let localDate;
  try {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(now));
    const date = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
    localDate = `${date.year}-${date.month}-${date.day}`;
  } catch { return false; }
  if (day.date < localDate) return true;
  if (day.date !== localDate || !Array.isArray(day.windows) || day.windows.length === 0) return false;
  const ends = day.windows.map((window) => Date.parse(window?.end));
  return ends.every((end) => Number.isFinite(end) && end <= now);
}

export function installNativePresentation({ snapshot, command }) {
  let error = null;
  let commandResult = null;
  let commandSequence = 0;
  const publish = (result = commandResult, reportedError = error) => {
    let value;
    let payloadError = reportedError;
    try {
      value = snapshot();
    } catch (cause) {
      value = { schema: 1, ready: false };
      payloadError = cause?.message ?? String(cause);
    }
    const payload = { ...value, schema: 1, error: payloadError, commandResult: result };
    try { globalThis.window?.webkit?.messageHandlers?.flaglerNative?.postMessage?.(payload); } catch { /* Native bridge is optional. */ }
    return payload;
  };
  const api = {
    publish,
    async command(message = {}) {
      const sequence = ++commandSequence;
      const action = message?.action;
      const correlation = typeof message.requestId === "string" ? { requestId: message.requestId } : {};
      if (!ACTIONS.has(action)) {
        error = `Unsupported native action: ${String(action ?? "")}`;
        commandResult = { action: action ?? null, success: false, error, ...correlation };
        return publish();
      }
      error = null;
      commandResult = { action, success: null, pending: true, ...correlation };
      if (action === "snapshot") {
        commandResult = { action, success: true, ...correlation };
        return publish();
      }
      let acknowledgement;
      try {
        const result = await command(action, message);
        acknowledgement = { action, success: true, ...correlation, ...(result?.id != null ? { id: result.id } : {}) };
      } catch (cause) {
        const messageText = cause?.message ?? String(cause);
        acknowledgement = { action, success: false, error: messageText, ...correlation, ...(message?.id != null ? { id: message.id } : {}) };
      }
      if (sequence === commandSequence) {
        error = acknowledgement.error ?? null;
        commandResult = acknowledgement;
        return publish();
      }
      // The older operation still reports its own correlated result, but cannot replace
      // the current snapshot's command status or error after a newer request has started.
      return publish(acknowledgement, error);
    },
  };
  globalThis.window ??= globalThis;
  globalThis.window.FlaglerNative = api;
  return api;
}
