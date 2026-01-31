import { google } from "googleapis";

export async function calendarUpcoming(
  auth: any,
  hours: number,
  tz: string,
  calendarId?: string,
) {
  const cal = google.calendar({ version: "v3", auth });
  const now = new Date();
  const max = new Date(now.getTime() + Math.max(1, hours) * 3600 * 1000);

  const res = await cal.events.list({
    calendarId: calendarId ?? "primary",
    timeMin: now.toISOString(),
    timeMax: max.toISOString(),
    singleEvents: true,
    orderBy: "startTime",
    maxResults: 50,
    timeZone: tz,
  });

  return res.data.items ?? [];
}

export async function calendarCreate(auth: any, event: any, calendarId?: string) {
  const cal = google.calendar({ version: "v3", auth });
  const res = await cal.events.insert({
    calendarId: calendarId ?? "primary",
    requestBody: event,
  });
  return res.data;
}

export async function calendarUpdate(
  auth: any,
  eventId: string,
  patch: any,
  calendarId?: string,
) {
  const cal = google.calendar({ version: "v3", auth });
  const res = await cal.events.patch({
    calendarId: calendarId ?? "primary",
    eventId,
    requestBody: patch,
  });
  return res.data;
}

export async function calendarDelete(auth: any, eventId: string, calendarId?: string) {
  const cal = google.calendar({ version: "v3", auth });
  await cal.events.delete({
    calendarId: calendarId ?? "primary",
    eventId,
  });
  return { deleted: true, eventId };
}
