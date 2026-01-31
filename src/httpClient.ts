export type BridgeRequest = {
  id: string;
  method: string;
  params?: any;
};

export type BridgeError = {
  code: string;
  message: string;
};

export type BridgeResponse =
  | { id: string; ok: true; result: any }
  | { id: string; ok: false; error: BridgeError };

export class HttpBridgeClient {
  constructor(
    private baseUrl: string,
    private timeoutMs: number,
    private authToken?: string,
  ) {
    this.baseUrl = this.baseUrl.replace(/\/+$/, "");
  }

  async call(method: string, params?: any): Promise<any> {
    const req: BridgeRequest = { id: crypto.randomUUID(), method, params };

    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), this.timeoutMs);

    try {
      const res = await fetch(`${this.baseUrl}/call`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(this.authToken ? { authorization: `Bearer ${this.authToken}` } : {}),
        },
        body: JSON.stringify(req),
        signal: ac.signal,
      });

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status} from bridge: ${body || res.statusText}`);
      }

      const data = (await res.json()) as BridgeResponse;
      if (!data || typeof data !== "object") throw new Error("Invalid bridge response");
      if (data.ok) return (data as any).result;
      const err = (data as any).error;
      const e = new Error(err?.message ?? "Bridge error");
      (e as any).code = err?.code ?? "BRIDGE_ERROR";
      throw e;
    } finally {
      clearTimeout(t);
    }
  }
}
