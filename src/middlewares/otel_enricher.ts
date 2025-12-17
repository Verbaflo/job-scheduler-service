import { NextFunction, Request, Response } from 'express';
import { context, trace } from '@opentelemetry/api';
import { RequestContext } from './request_context';

const REDACT = new Set([
  'password',
  'token',
  'authorization',
  'secret',
  'accessToken',
  'refreshToken',
]);

function sanitizeObject(input: unknown): unknown {
  if (!input || typeof input !== 'object') return input;
  const copy: any = Array.isArray(input) ? [...(input as any[])] : { ...(input as Record<string, any>) };
  for (const key of Object.keys(copy)) {
    const lower = key.toLowerCase();
    if (REDACT.has(lower)) {
      copy[key] = '***REDACTED***';
      continue;
    }
    if (typeof copy[key] === 'object') {
      copy[key] = sanitizeObject(copy[key]);
    } else if (typeof copy[key] === 'string' && copy[key].length > 5000) {
      copy[key] = copy[key].slice(0, 5000) + '…[TRUNCATED]';
    }
  }
  return copy;
}

function safeStringify(value: unknown, maxLen = 4000): string {
  try {
    const str = JSON.stringify(value);
    if (str.length > maxLen) return str.slice(0, maxLen) + '…[TRUNCATED]';
    return str;
  } catch {
    return '[Unserializable]';
  }
}

export function otelRequestEnricher(req: Request, _res: Response, next: NextFunction) {
  // Avoid noisy health checks
  if (req.path === '/health') return next();

  const span = trace.getSpan(context.active());
  if (span) {
    const requestId = RequestContext.getRequestId();
    const method = req.method;

    // Collect parameters
    const params = sanitizeObject(req.params);
    const query = sanitizeObject(req.query);
    const shouldIncludeBody = method === 'POST' || method === 'PUT' || method === 'PATCH';
    const body = shouldIncludeBody ? sanitizeObject(req.body) : undefined;

    // Attach attributes visible in Jaeger
    span.setAttribute('request.id', requestId);
    if (params && Object.keys(params as Record<string, unknown>).length) {
      span.setAttribute('http.request.params', safeStringify(params));
    }
    if (query && Object.keys(query as Record<string, unknown>).length) {
      span.setAttribute('http.request.query', safeStringify(query));
    }
    if (body !== undefined) {
      span.setAttribute('http.request.body', safeStringify(body));
    }
  }
  next();
}

