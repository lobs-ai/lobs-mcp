import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export type CalendarPerm = "deny" | "read" | "write";

export type CalendarAcl = {
  /** Default permission for calendars not explicitly listed. */
  default?: CalendarPerm;
  /** Per-calendar permissions by calendarId ("primary" allowed). */
  calendars?: Record<string, CalendarPerm>;
};

export function defaultAclPath() {
  const xdg = process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), ".config");
  return path.join(xdg, "lobs-mcp", "calendar-acl.json");
}

export function loadCalendarAcl(): CalendarAcl {
  const p = process.env.LOBS_CALENDAR_ACL_PATH ?? defaultAclPath();
  try {
    const raw = fs.readFileSync(p, "utf8");
    return JSON.parse(raw) as CalendarAcl;
  } catch {
    // Easy mode: allow read everywhere, write nowhere unless allowed explicitly.
    return { default: "read", calendars: { primary: "write" } };
  }
}

export function permForCalendar(acl: CalendarAcl, calendarId: string): CalendarPerm {
  const normalized = calendarId || "primary";
  const p = acl.calendars?.[normalized];
  return p ?? acl.default ?? "read";
}

export function requireCalendarPerm(
  acl: CalendarAcl,
  calendarId: string,
  needed: Exclude<CalendarPerm, "deny">,
) {
  const p = permForCalendar(acl, calendarId);
  if (p === "deny") {
    throw Object.assign(new Error(`Calendar access denied: ${calendarId}`), {
      code: "PERMISSION_DENIED",
    });
  }
  if (needed === "write" && p !== "write") {
    throw Object.assign(new Error(`Calendar is read-only: ${calendarId}`), {
      code: "PERMISSION_DENIED",
    });
  }
}
