import net from "node:net";

export type BridgeRequest = {
  id: string;
  method: string;
  params?: unknown;
};

export type BridgeError = {
  code: string;
  message: string;
  data?: unknown;
};

export type BridgeResponse =
  | { id: string; ok: true; result: unknown }
  | { id: string; ok: false; error: BridgeError };

export class UdsBridgeClient {
  constructor(private socketPath: string, private timeoutMs: number) {}

  async call<T = unknown>(method: string, params?: unknown): Promise<T> {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const req: BridgeRequest = { id, method, params };

    return await new Promise<T>((resolve, reject) => {
      const sock = net.createConnection({ path: this.socketPath });
      let settled = false;
      let buffer = "";

      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        sock.destroy();
        reject(new Error(`Bridge timeout after ${this.timeoutMs}ms (${method})`));
      }, this.timeoutMs);

      const cleanup = () => {
        clearTimeout(timeout);
        sock.removeAllListeners();
      };

      sock.on("error", (err) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(err);
      });

      sock.on("connect", () => {
        sock.write(JSON.stringify(req) + "\n");
      });

      sock.on("data", (chunk) => {
        buffer += chunk.toString("utf8");
        // Expect one JSON line response.
        const idx = buffer.indexOf("\n");
        if (idx === -1) return;

        const line = buffer.slice(0, idx).trim();
        if (!line) return;

        let res: BridgeResponse;
        try {
          res = JSON.parse(line) as BridgeResponse;
        } catch (e) {
          if (settled) return;
          settled = true;
          cleanup();
          sock.destroy();
          reject(new Error(`Invalid JSON from bridge: ${line.slice(0, 200)}`));
          return;
        }

        if (res.id !== id) {
          // Ignore unrelated lines.
          buffer = buffer.slice(idx + 1);
          return;
        }

        if (settled) return;
        settled = true;
        cleanup();
        sock.end();

        if (res.ok) resolve(res.result as T);
        else reject(new Error(`${res.error.code}: ${res.error.message}`));
      });

      sock.on("end", () => {
        if (settled) return;
        // If the bridge closes without newline, try parse whatever we have.
        const line = buffer.trim();
        if (!line) {
          settled = true;
          cleanup();
          reject(new Error("Bridge closed without response"));
          return;
        }
        try {
          const res = JSON.parse(line) as BridgeResponse;
          if (res.id !== id) throw new Error("Mismatched id");
          settled = true;
          cleanup();
          if (res.ok) resolve(res.result as T);
          else reject(new Error(`${res.error.code}: ${res.error.message}`));
        } catch {
          settled = true;
          cleanup();
          reject(new Error(`Bridge closed with non-JSON response: ${line.slice(0, 200)}`));
        }
      });
    });
  }
}
