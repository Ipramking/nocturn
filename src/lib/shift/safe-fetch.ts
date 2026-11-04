import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import zlib from "node:zlib";
import type { TLSSocket } from "node:tls";

// Every outbound request to a user-supplied URL goes through here. The guarded
// DNS lookup runs on each connection (including redirects), so a hostname that
// resolves to a private or metadata address is refused before any bytes go out.

export class BlockedUrlError extends Error {}

export const USER_AGENT =
  "Mozilla/5.0 (compatible; NOCTURN/1.0; +night-shift health check)";

const V4_BLOCKS: Array<[string, number]> = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];

function v4ToInt(ip: string) {
  return ip.split(".").reduce((acc, octet) => (acc << 8) + Number(octet), 0) >>> 0;
}

function inV4Block(ip: string, base: string, bits: number) {
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (v4ToInt(ip) & mask) === (v4ToInt(base) & mask);
}

export function isBlockedIp(ip: string): boolean {
  if (net.isIPv4(ip)) return V4_BLOCKS.some(([base, bits]) => inV4Block(ip, base, bits));
  if (!net.isIPv6(ip)) return true;

  const lower = ip.toLowerCase();
  const dotted = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted) return isBlockedIp(dotted[1]);
  const hexMapped = lower.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hexMapped) {
    const hi = parseInt(hexMapped[1], 16);
    const lo = parseInt(hexMapped[2], 16);
    return isBlockedIp(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
  }
  if (lower === "::" || lower === "::1") return true;
  if (lower.startsWith("64:ff9b:") || lower.startsWith("2001:db8")) return true;
  const first = parseInt(lower.split(":")[0] || "0", 16);
  if ((first & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
  if ((first & 0xffc0) === 0xfe80) return true; // fe80::/10 link local
  if ((first & 0xff00) === 0xff00) return true; // multicast
  return false;
}

const guardedLookup: net.LookupFunction = (hostname, options, callback) => {
  dns.lookup(hostname, { all: true, family: options?.family ?? 0 }, (err, addresses) => {
    if (err) return callback(err, "", 4);
    const list = addresses as unknown as dns.LookupAddress[];
    if (list.length === 0 || list.some((a) => isBlockedIp(a.address))) {
      return callback(new BlockedUrlError(`${hostname} resolves to a private address`), "", 4);
    }
    if ((options as dns.LookupAllOptions)?.all) {
      return (callback as unknown as (e: null, a: dns.LookupAddress[]) => void)(null, list);
    }
    callback(null, list[0].address, list[0].family);
  });
};

export function normalizeUrl(input: string): URL {
  const trimmed = input.trim();
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    throw new BlockedUrlError("That doesn't look like a URL");
  }
  assertPublicUrl(url);
  url.hash = "";
  return url;
}

export function assertPublicUrl(url: URL) {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new BlockedUrlError("Only http and https URLs can be checked");
  }
  if (url.username || url.password) throw new BlockedUrlError("URLs with credentials are not allowed");
  if (url.port && url.port !== "80" && url.port !== "443") {
    throw new BlockedUrlError("Only standard ports (80/443) can be checked");
  }
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (host === "localhost" || /\.(local|localhost|internal|lan|home|corp)$/.test(host)) {
    throw new BlockedUrlError("Private hostnames can't be checked");
  }
  if (net.isIP(host) && isBlockedIp(host)) throw new BlockedUrlError("Private addresses can't be checked");
  if (!net.isIP(host) && !host.includes(".")) throw new BlockedUrlError("Use a full public domain");
}

export interface CertInfo {
  validTo: string;
  daysLeft: number;
  issuer: string;
  subject: string;
  authorized: boolean;
  authError?: string;
}

export interface SafeResponse {
  url: string;
  status: number;
  headers: http.IncomingHttpHeaders;
  body: string;
  bytes: number;
  truncated: boolean;
  ttfbMs: number;
  totalMs: number;
  redirects: string[];
  cert?: CertInfo;
  tlsProtocol?: string;
}

export interface SafeFetchOptions {
  method?: "GET" | "HEAD";
  /** false = stop after headers (cheap status/timing probes). */
  readBody?: boolean;
  maxBytes?: number;
  timeoutMs?: number;
  maxRedirects?: number;
  accept?: string;
}

type Hop = Omit<SafeResponse, "url" | "totalMs" | "redirects">;

function requestOnce(url: URL, o: Required<SafeFetchOptions>): Promise<Hop> {
  return new Promise((resolve, reject) => {
    const started = performance.now();
    const lib = url.protocol === "https:" ? https : http;
    const req = lib.request(
      url,
      {
        method: o.method,
        agent: false,
        lookup: guardedLookup,
        rejectUnauthorized: false,
        headers: { "user-agent": USER_AGENT, accept: o.accept, "accept-encoding": "gzip, deflate, br" },
      },
      (res) => {
        const ttfbMs = Math.round(performance.now() - started);
        let cert: CertInfo | undefined;
        let tlsProtocol: string | undefined;
        const socket = res.socket as TLSSocket;
        if (typeof socket?.getPeerCertificate === "function") {
          const peer = socket.getPeerCertificate();
          if (peer && peer.valid_to) {
            cert = {
              validTo: new Date(peer.valid_to).toISOString(),
              daysLeft: Math.floor((new Date(peer.valid_to).getTime() - Date.now()) / 86_400_000),
              issuer: String(peer.issuer?.O ?? peer.issuer?.CN ?? "unknown"),
              subject: String(peer.subject?.CN ?? ""),
              authorized: socket.authorized,
              authError: socket.authorizationError ? String(socket.authorizationError) : undefined,
            };
          }
          tlsProtocol = socket.getProtocol() ?? undefined;
        }
        const base = { status: res.statusCode ?? 0, headers: res.headers, ttfbMs, cert, tlsProtocol };

        if (o.method === "HEAD" || !o.readBody) {
          res.destroy();
          clearTimeout(timer);
          return resolve({ ...base, body: "", bytes: 0, truncated: false });
        }

        const encoding = String(res.headers["content-encoding"] ?? "").toLowerCase();
        let stream: NodeJS.ReadableStream = res;
        if (encoding.includes("br")) stream = res.pipe(zlib.createBrotliDecompress());
        else if (encoding.includes("gzip")) stream = res.pipe(zlib.createGunzip());
        else if (encoding.includes("deflate")) stream = res.pipe(zlib.createInflate());

        const chunks: Buffer[] = [];
        let bytes = 0;
        let truncated = false;
        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve({ ...base, body: Buffer.concat(chunks).toString("utf8"), bytes, truncated });
        };
        stream.on("data", (chunk: Buffer) => {
          if (truncated) return;
          bytes += chunk.length;
          if (bytes > o.maxBytes) {
            truncated = true;
            chunks.push(chunk.subarray(0, chunk.length - (bytes - o.maxBytes)));
            res.destroy();
            return finish();
          }
          chunks.push(chunk);
        });
        stream.on("end", finish);
        stream.on("error", (err) => (truncated ? finish() : reject(err)));
      },
    );
    const timer = setTimeout(
      () => req.destroy(new Error(`Timed out after ${Math.round(o.timeoutMs / 1000)}s`)),
      o.timeoutMs,
    );
    req.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    req.end();
  });
}

export async function safeFetch(target: string | URL, options: SafeFetchOptions = {}): Promise<SafeResponse> {
  const o: Required<SafeFetchOptions> = {
    method: options.method ?? "GET",
    readBody: options.readBody ?? true,
    maxBytes: options.maxBytes ?? 3_000_000,
    timeoutMs: options.timeoutMs ?? 12_000,
    maxRedirects: options.maxRedirects ?? 5,
    accept: options.accept ?? "text/html,application/xhtml+xml,*/*;q=0.8",
  };
  const started = performance.now();
  const redirects: string[] = [];
  let url = typeof target === "string" ? new URL(target) : target;

  for (let hop = 0; ; hop++) {
    assertPublicUrl(url);
    const res = await requestOnce(url, o);
    const location = res.headers.location;
    if (res.status >= 300 && res.status < 400 && location && hop < o.maxRedirects) {
      redirects.push(url.toString());
      url = new URL(location, url);
      continue;
    }
    return { ...res, url: url.toString(), totalMs: Math.round(performance.now() - started), redirects };
  }
}
