import test from "node:test";
import assert from "node:assert/strict";

import { permForCalendar, requireCalendarPerm, type CalendarAcl } from "./calendarAcl.js";

test("calendar ACL: default fallback is read-only", () => {
  const acl: CalendarAcl = { default: "read", calendars: {} };

  assert.equal(permForCalendar(acl, "primary"), "read");
  assert.equal(permForCalendar(acl, "someone@group.calendar.google.com"), "read");

  // Read should be allowed everywhere.
  requireCalendarPerm(acl, "primary", "read");

  // Writes should be blocked unless explicitly allowlisted.
  assert.throws(
    () => requireCalendarPerm(acl, "primary", "write"),
    (err: any) => err?.code === "PERMISSION_DENIED" && /read-only/i.test(String(err?.message)),
  );
});

test("calendar ACL: explicit per-calendar write allowlist", () => {
  const acl: CalendarAcl = {
    default: "read",
    calendars: {
      primary: "write",
      "ro@group.calendar.google.com": "read",
    },
  };

  requireCalendarPerm(acl, "primary", "write");
  assert.throws(() => requireCalendarPerm(acl, "ro@group.calendar.google.com", "write"));
});
