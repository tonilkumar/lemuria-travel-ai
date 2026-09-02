import type { ApiErrorBody, ApiPaginated, ApiSuccess, ErrorCode } from '@lemuria/shared';

const BASE = '/api/v1';

/**
 * The access token is held in memory only.
 *
 * It is deliberately never written to localStorage or a readable cookie: the
 * refresh token lives in an httpOnly cookie, so a page reload re-mints the
 * access token silently while an XSS payload still has nothing to steal.
 */
let accessToken: string | null = null;
let refreshInFlight: Promise<boolean> | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details: unknown;
  readonly requestId: string | undefined;

  constructor(status: number, body: ApiErrorBody) {
    super(body.error.message);
    this.name = 'ApiError';
    this.status = status;
    this.code = body.error.code;
    this.details = body.error.details;
    this.requestId = body.error.requestId;
  }

  /** Field-level messages from a VALIDATION_ERROR, for react-hook-form. */
  get fieldErrors(): Record<string, string[]> {
    return this.code === 'VALIDATION_ERROR' && this.details && typeof this.details === 'object'
      ? (this.details as Record<string, string[]>)
      : {};
  }
}

async function parseError(res: Response): Promise<ApiError> {
  let body: ApiErrorBody;
  try {
    body = (await res.json()) as ApiErrorBody;
    if (!body?.error?.code) throw new Error('malformed');
  } catch {
    body = {
      success: false,
      error: {
        code: res.status === 429 ? 'RATE_LIMITED' : 'INTERNAL_ERROR',
        message:
          res.status === 0
            ? 'Cannot reach the server. Check your connection.'
            : 'Something went wrong. Please try again.',
      },
    };
  }
  return new ApiError(res.status, body);
}

/**
 * Refreshes the access token, collapsing concurrent 401s into one request so a
 * dashboard firing six queries at once does not trigger six token rotations
 * (which would each invalidate the last).
 */
async function refreshAccessToken(): Promise<boolean> {
  refreshInFlight ??= (async () => {
    try {
      const res = await fetch(`${BASE}/auth/refresh`, {
        method: 'POST',
        credentials: 'same-origin',
      });
      if (!res.ok) return false;
      const body = (await res.json()) as ApiSuccess<{ accessToken: string }>;
      accessToken = body.data.accessToken;
      return true;
    } catch {
      return false;
    } finally {
      // Release the latch on the next tick so callers awaiting it all resolve.
      queueMicrotask(() => {
        refreshInFlight = null;
      });
    }
  })();

  return refreshInFlight;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  query?: Record<string, unknown>;
  signal?: AbortSignal;
  /** Internal: prevents an infinite refresh loop. */
  _retried?: boolean;
}

function buildUrl(path: string, query?: Record<string, unknown>): string {
  const url = new URL(`${BASE}${path}`, window.location.origin);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === '') continue;
      if (Array.isArray(value)) {
        for (const v of value) if (v !== undefined && v !== null) url.searchParams.append(key, String(v));
      } else {
        url.searchParams.set(key, String(value));
      }
    }
  }
  return url.pathname + url.search;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, query, signal } = options;

  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  let res: Response;
  try {
    res = await fetch(buildUrl(path, query), {
      method,
      headers,
      credentials: 'same-origin',
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      ...(signal ? { signal } : {}),
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    throw new ApiError(0, {
      success: false,
      error: { code: 'DEPENDENCY_FAILURE', message: 'Cannot reach the server. Check your connection.' },
    });
  }

  if (res.status === 401 && !options._retried && path !== '/auth/refresh' && path !== '/auth/login') {
    const refreshed = await refreshAccessToken();
    if (refreshed) return request<T>(path, { ...options, _retried: true });
    accessToken = null;
    window.dispatchEvent(new CustomEvent('lemuria:session-expired'));
  }

  if (!res.ok) throw await parseError(res);
  if (res.status === 204) return undefined as T;

  return (await res.json()) as T;
}

export const api = {
  get: <T>(path: string, query?: Record<string, unknown>, signal?: AbortSignal) =>
    request<ApiSuccess<T>>(path, { query, ...(signal ? { signal } : {}) }).then((r) => r.data),

  list: <T>(path: string, query?: Record<string, unknown>, signal?: AbortSignal) =>
    request<ApiPaginated<T>>(path, { query, ...(signal ? { signal } : {}) }),

  post: <T>(path: string, body?: unknown) =>
    request<ApiSuccess<T>>(path, { method: 'POST', body }).then((r) => r.data),

  patch: <T>(path: string, body?: unknown) =>
    request<ApiSuccess<T>>(path, { method: 'PATCH', body }).then((r) => r.data),

  delete: <T>(path: string) =>
    request<ApiSuccess<T>>(path, { method: 'DELETE' }).then((r) => r.data),

  refresh: refreshAccessToken,
};
