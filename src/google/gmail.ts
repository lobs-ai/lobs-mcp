import { google } from "googleapis";

export type GmailMessageSummary = {
  id: string;
  threadId?: string;
  snippet?: string;
  internalDate?: string;
  from?: string;
  subject?: string;
};

function header(headers: any[] | undefined, name: string): string | undefined {
  const h = headers?.find((x) => String(x?.name).toLowerCase() === name.toLowerCase());
  const v = h?.value;
  return v ? String(v) : undefined;
}

export async function gmailUnread(auth: any, max: number) {
  const gmail = google.gmail({ version: "v1", auth });
  const res = await gmail.users.messages.list({
    userId: "me",
    q: "is:unread",
    maxResults: Math.max(1, Math.min(100, max)),
  });

  const msgs = res.data.messages ?? [];
  const out: GmailMessageSummary[] = [];

  for (const m of msgs) {
    const id = String(m.id);
    const full = await gmail.users.messages.get({
      userId: "me",
      id,
      format: "metadata",
      metadataHeaders: ["From", "Subject", "Date"],
    });

    const payload = full.data.payload;
    out.push({
      id,
      threadId: full.data.threadId ?? undefined,
      snippet: full.data.snippet ?? undefined,
      internalDate: full.data.internalDate ?? undefined,
      from: header(payload?.headers as any, "From"),
      subject: header(payload?.headers as any, "Subject"),
    });
  }

  return out;
}

export async function gmailSearch(auth: any, q: string, max: number) {
  const gmail = google.gmail({ version: "v1", auth });
  const res = await gmail.users.messages.list({
    userId: "me",
    q,
    maxResults: Math.max(1, Math.min(100, max)),
  });

  const msgs = res.data.messages ?? [];
  const out: GmailMessageSummary[] = [];

  for (const m of msgs) {
    const id = String(m.id);
    const full = await gmail.users.messages.get({
      userId: "me",
      id,
      format: "metadata",
      metadataHeaders: ["From", "Subject", "Date"],
    });

    const payload = full.data.payload;
    out.push({
      id,
      threadId: full.data.threadId ?? undefined,
      snippet: full.data.snippet ?? undefined,
      internalDate: full.data.internalDate ?? undefined,
      from: header(payload?.headers as any, "From"),
      subject: header(payload?.headers as any, "Subject"),
    });
  }

  return out;
}

export async function gmailMarkRead(auth: any, messageIds: string[]) {
  const gmail = google.gmail({ version: "v1", auth });
  const ids = messageIds.map(String).filter(Boolean);
  if (ids.length === 0) return { updated: 0 };

  // Batch modify isn't available in a single call; do sequential for simplicity.
  let updated = 0;
  for (const id of ids) {
    await gmail.users.messages.modify({
      userId: "me",
      id,
      requestBody: { removeLabelIds: ["UNREAD"] },
    });
    updated += 1;
  }

  return { updated };
}
