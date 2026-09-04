// plugins/vercel-shim.ts
// Adapts a raw Node ServerResponse to the Express-style API the Vercel
// serverless functions expect (res.status().json() / res.send()).
import type { ServerResponse } from "http";

export function shimVercelRes(res: ServerResponse): any {
  const r = res as any;
  if (typeof r.status !== "function") {
    r.status = (code: number) => {
      r.statusCode = code;
      return r;
    };
  }
  if (typeof r.json !== "function") {
    r.json = (body: unknown) => {
      if (!r.getHeader("Content-Type")) {
        r.setHeader("Content-Type", "application/json");
      }
      r.end(JSON.stringify(body));
      return r;
    };
  }
  if (typeof r.send !== "function") {
    r.send = (body: any) => {
      if (body === undefined || body === null) {
        r.end();
        return r;
      }
      if (Buffer.isBuffer(body) || body instanceof Uint8Array) {
        r.end(Buffer.from(body));
        return r;
      }
      if (typeof body === "object") {
        if (!r.getHeader("Content-Type")) {
          r.setHeader("Content-Type", "application/json");
        }
        r.end(JSON.stringify(body));
        return r;
      }
      r.end(String(body));
      return r;
    };
  }
  return r;
}
