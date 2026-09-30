import { createHash } from 'node:crypto';
import type { MiddlewareHandler } from 'hono';

/*
 * Security review 2026-09-30 (E11-A5): the response headers every answer of the api
 * carries, whatever route produced it (better-auth's included), and the Content Security
 * Policy of the HTML shell. The api serves the built web bundle itself (`app.ts`), locally
 * behind Caddy and in production behind the Caddy of `infra/caddy`, so these headers are
 * set here once and hold on every edge. `Strict-Transport-Security` is the edge's own
 * (production Caddyfile): sent from here it would pin `localhost` to HTTPS in a
 * developer's browser.
 */

/** Set on every response unless the route already set the header itself. */
export const BASE_SECURITY_HEADERS: Readonly<Record<string, string>> = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  // The app is never framed (no iframe of its own); CSP `frame-ancestors` says the same to
  // browsers that read it.
  'x-frame-options': 'DENY',
  // The capture surfaces use the camera and geolocation (the location stamp) and, when the
  // Dictation engine is on, the microphone; nothing else, and never from another origin.
  'permissions-policy': 'camera=(self), microphone=(self), geolocation=(self), payment=(), usb=(), serial=(), bluetooth=()',
  'cross-origin-resource-policy': 'same-origin',
};

/**
 * `/api/*` answers carry a relatório's data, photos and documents: none of them belongs
 * in the browser's HTTP cache of a shared tablet (the device keeps what it needs in
 * IndexedDB). A route that decides its own caching keeps it.
 */
const API_CACHE_CONTROL = 'no-store';

function isApiPath(path: string): boolean {
  return path === '/api' || path.startsWith('/api/');
}

export function securityHeaders(): MiddlewareHandler {
  return async (c, next) => {
    await next();
    const headers = c.res.headers;
    for (const [name, value] of Object.entries(BASE_SECURITY_HEADERS)) {
      if (!headers.has(name)) headers.set(name, value);
    }
    if (isApiPath(c.req.path) && !headers.has('cache-control')) headers.set('cache-control', API_CACHE_CONTROL);
  };
}

const INLINE_SCRIPT = /<script(?![^>]*\bsrc\s*=)[^>]*>([\s\S]*?)<\/script>/gi;

/** The CSP source of every inline `<script>` of the document (the theme bootstrap of `index.html`). */
export function inlineScriptHashes(html: string): string[] {
  const hashes: string[] = [];
  for (const match of html.matchAll(INLINE_SCRIPT)) {
    const body = match[1] ?? '';
    if (body.trim() === '') continue;
    hashes.push(`'sha256-${createHash('sha256').update(body, 'utf8').digest('base64')}'`);
  }
  return hashes;
}

/**
 * The Content Security Policy of an HTML document the api serves. Scripts are the
 * bundle's own files plus the exact inline scripts of this document (hashed, so an
 * injected one never runs); styles allow inline because the shell carries a `<style>`
 * boot splash and React Aria positions overlays with inline styles. Images and media take
 * `blob:` (photos and logos are shown from IndexedDB blobs) and `data:` (the inline
 * favicon). Nothing is ever loaded from another origin.
 */
export function htmlContentSecurityPolicy(html: string): string {
  const scripts = ["'self'", ...inlineScriptHashes(html)].join(' ');
  return [
    "default-src 'self'",
    `script-src ${scripts}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "media-src 'self' blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "worker-src 'self'",
    "manifest-src 'self'",
    // A certificate PDF opens as a `blob:` tab that inherits this policy; Chrome's PDF viewer
    // is governed by object-src, so blobs (always created by this origin's own script) pass.
    "object-src 'self' blob:",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-src 'none'",
    "frame-ancestors 'none'",
  ].join('; ');
}
