#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { UdsBridgeClient } from "./udsClient.js";
import { HttpBridgeClient } from "./httpClient.js";
import { loadConfig } from "./config.js";

const cfg = loadConfig();
const bridge =
  cfg.bridgeTransport === "uds"
    ? new UdsBridgeClient(cfg.socketPath, cfg.timeoutMs)
    : new HttpBridgeClient(cfg.httpUrl, cfg.timeoutMs, cfg.authToken);

const server = new Server(
  {
    name: "lobs-mcp",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "bridge_ping",
        description: "Ping the local UDS bridge service.",
        inputSchema: {
          type: "object",
          additionalProperties: false,
          properties: {},
        },
      },
      {
        name: "gmail_unread",
        description: "Fetch unread Gmail message summaries (read-only).",
        inputSchema: {
          type: "object",
          additionalProperties: false,
          properties: {
            max: { type: "number", description: "Max messages", default: 20 },
          },
        },
      },
      {
        name: "gmail_search",
        description: "Search Gmail (read-only) using Gmail search syntax.",
        inputSchema: {
          type: "object",
          additionalProperties: false,
          required: ["q"],
          properties: {
            q: { type: "string", description: "Gmail search query" },
            max: { type: "number", description: "Max messages", default: 20 },
          },
        },
      },
      {
        name: "gmail_mark_read",
        description: "Mark Gmail messages as read (no send; modifies labels).",
        inputSchema: {
          type: "object",
          additionalProperties: false,
          required: ["messageIds"],
          properties: {
            messageIds: {
              type: "array",
              items: { type: "string" },
              description: "List of Gmail message IDs",
            },
          },
        },
      },
      {
        name: "calendar_list",
        description: "List calendars available to the bridge (and their IDs).",
        inputSchema: {
          type: "object",
          additionalProperties: false,
          properties: {},
        },
      },
      {
        name: "calendar_upcoming",
        description: "List upcoming events.",
        inputSchema: {
          type: "object",
          additionalProperties: false,
          properties: {
            hours: { type: "number", description: "Lookahead window in hours", default: 72 },
            tz: { type: "string", description: "Timezone", default: "America/New_York" },
            calendarId: { type: "string", description: "Calendar id (default: primary)" },
          },
        },
      },
      {
        name: "calendar_create",
        description: "Create a calendar event (requires calendar write permission).",
        inputSchema: {
          type: "object",
          additionalProperties: false,
          required: ["event"],
          properties: {
            calendarId: { type: "string", description: "Calendar id (default: primary)" },
            event: { type: "object", description: "Google Calendar event resource (partial)" },
          },
        },
      },
      {
        name: "calendar_update",
        description: "Update a calendar event by eventId.",
        inputSchema: {
          type: "object",
          additionalProperties: false,
          required: ["eventId", "patch"],
          properties: {
            calendarId: { type: "string", description: "Calendar id (default: primary)" },
            eventId: { type: "string" },
            patch: { type: "object", description: "Partial event resource to patch" },
          },
        },
      },
      {
        name: "calendar_delete",
        description: "Delete a calendar event by eventId.",
        inputSchema: {
          type: "object",
          additionalProperties: false,
          required: ["eventId"],
          properties: {
            calendarId: { type: "string", description: "Calendar id (default: primary)" },
            eventId: { type: "string" },
          },
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "bridge_ping": {
        const result = await bridge.call("ping");
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
      case "gmail_unread": {
        const max = Number((args as any)?.max ?? 20);
        const result = await bridge.call("gmail.unread", { max });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
      case "gmail_search": {
        const q = String((args as any)?.q ?? "");
        const max = Number((args as any)?.max ?? 20);
        const result = await bridge.call("gmail.search", { q, max });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
      case "gmail_mark_read": {
        const messageIds = ((args as any)?.messageIds ?? []) as string[];
        const result = await bridge.call("gmail.markRead", { messageIds });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
      case "calendar_list": {
        const result = await bridge.call("calendar.list");
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
      case "calendar_upcoming": {
        const hours = Number((args as any)?.hours ?? 72);
        const tz = String((args as any)?.tz ?? "America/New_York");
        const calendarId = (args as any)?.calendarId as string | undefined;
        const result = await bridge.call("calendar.upcoming", { hours, tz, calendarId });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
      case "calendar_create": {
        const calendarId = (args as any)?.calendarId as string | undefined;
        const event = (args as any)?.event;
        const result = await bridge.call("calendar.create", { calendarId, event });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
      case "calendar_update": {
        const calendarId = (args as any)?.calendarId as string | undefined;
        const eventId = String((args as any)?.eventId ?? "");
        const patch = (args as any)?.patch;
        const result = await bridge.call("calendar.update", { calendarId, eventId, patch });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
      case "calendar_delete": {
        const calendarId = (args as any)?.calendarId as string | undefined;
        const eventId = String((args as any)?.eventId ?? "");
        const result = await bridge.call("calendar.delete", { calendarId, eventId });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (err: any) {
    return {
      content: [
        {
          type: "text",
          text: `Error calling ${name}: ${err?.message ?? String(err)}`,
        },
      ],
      isError: true,
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Intentionally no stdout logging; MCP uses stdio.
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
