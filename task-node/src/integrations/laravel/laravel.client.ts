import type { LaravelConfig } from '../../config/env.js';
import type { Logger } from '../../utils/logger.js';

export interface LaravelResponse {
  status: number;
  /** Parsed JSON body, or undefined when the body is empty or not JSON. */
  body: unknown;
}

/** Network failure, timeout or an unreadable response. Never contains the service token. */
export class LaravelUnavailableError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'LaravelUnavailableError';
  }
}

/**
 * Minimal HTTP client for Laravel's internal API (diagram step 6).
 * Authenticates as this service with a bearer token, enforces a timeout and logs only the
 * method, path template, status and duration.
 */
export class LaravelClient {
  constructor(
    private readonly config: LaravelConfig,
    private readonly logger: Logger,
    private readonly fetchImpl: typeof fetch = fetch
  ) {}

  get(pathTemplate: string, params: Record<string, string | number>): Promise<LaravelResponse> {
    return this.request('GET', pathTemplate, params);
  }

  post(
    pathTemplate: string,
    params: Record<string, string | number>,
    body: unknown
  ): Promise<LaravelResponse> {
    return this.request('POST', pathTemplate, params, body);
  }

  /** Expands `{name}` placeholders with URL-encoded values. */
  buildUrl(pathTemplate: string, params: Record<string, string | number>): string {
    const path = pathTemplate.replace(/\{(\w+)\}/g, (_match, name: string) => {
      const value = params[name];
      if (value === undefined) {
        throw new Error(`Missing path parameter "${name}" for ${pathTemplate}`);
      }
      return encodeURIComponent(String(value));
    });
    return `${this.config.baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
  }

  private async request(
    method: 'GET' | 'POST',
    pathTemplate: string,
    params: Record<string, string | number>,
    body?: unknown
  ): Promise<LaravelResponse> {
    const url = this.buildUrl(pathTemplate, params);
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'User-Agent': 'taskflow-realtime-service',
    };
    if (this.config.serviceToken) {
      headers.Authorization = `Bearer ${this.config.serviceToken}`;
    }
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }

    const startedAt = Date.now();
    const meta = { method, path: pathTemplate };
    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(this.config.timeoutMs),
        redirect: 'error',
      });
    } catch (error) {
      const reason =
        error instanceof Error && error.name === 'TimeoutError'
          ? `timed out after ${this.config.timeoutMs}ms`
          : error instanceof Error
            ? error.message
            : 'request failed';
      this.logger.warn(
        { event: 'laravel_request_failed', ...meta, reason, durationMs: Date.now() - startedAt },
        'laravel_request_failed'
      );
      throw new LaravelUnavailableError(`Laravel ${method} ${pathTemplate} ${reason}`, {
        cause: error,
      });
    }

    const text = await response.text().catch(() => '');
    let parsed: unknown;
    if (text.length > 0) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = undefined;
      }
    }

    this.logger.debug(
      {
        event: 'laravel_request',
        ...meta,
        status: response.status,
        durationMs: Date.now() - startedAt,
      },
      'laravel_request'
    );
    return { status: response.status, body: parsed };
  }
}
