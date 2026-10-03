export type AuthoritativeQuoteResponse<TQuote> = {
  success?: boolean;
  quotes?: TQuote[];
  message?: string;
};

type QuoteRequestOptions<TQuote> = {
  baseUrl: string;
  body: Record<string, unknown>;
  getIdToken: (forceRefresh?: boolean) => Promise<string | null | undefined>;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

const DEFAULT_TIMEOUT_MS = 12_000;

export class AuthoritativeQuoteRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthoritativeQuoteRequestError';
  }
}

function withinDeadline<T>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new AuthoritativeQuoteRequestError(timeoutMessage)), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

async function sendQuoteRequest<TQuote>(input: {
  baseUrl: string;
  body: Record<string, unknown>;
  idToken: string;
  fetchImpl: typeof fetch;
  timeoutMs: number;
}): Promise<{ response: Response; payload: AuthoritativeQuoteResponse<TQuote> | null }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), input.timeoutMs);
  try {
    const response = await input.fetchImpl(`${input.baseUrl.replace(/\/$/, '')}/api/rides/quote`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${input.idToken}`,
      },
      body: JSON.stringify(input.body),
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => null) as AuthoritativeQuoteResponse<TQuote> | null;
    return { response, payload };
  } catch (error) {
    if ((error as { name?: string } | null)?.name === 'AbortError') {
      throw new AuthoritativeQuoteRequestError('Fares are taking too long to update. Check your connection and try again.');
    }
    throw new AuthoritativeQuoteRequestError('Unable to update fares. Check your connection and try again.');
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Loads server-owned fare quotes with a hard deadline. A stale Firebase token
 * receives exactly one forced-refresh retry; other failures are never replayed
 * because each successful request creates fresh auditable quote snapshots.
 */
export async function requestAuthoritativeRideQuotes<TQuote>(
  options: QuoteRequestOptions<TQuote>,
): Promise<TQuote[]> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const fetchImpl = options.fetchImpl ?? fetch;

  const acquireToken = async (forceRefresh: boolean) => {
    const token = await withinDeadline(
      options.getIdToken(forceRefresh),
      timeoutMs,
      'Your sign-in session is taking too long. Please try again.',
    );
    if (!token) throw new AuthoritativeQuoteRequestError('Please sign in again to update fares.');
    return token;
  };

  let result = await sendQuoteRequest<TQuote>({
    baseUrl: options.baseUrl,
    body: options.body,
    idToken: await acquireToken(false),
    fetchImpl,
    timeoutMs,
  });

  if (result.response.status === 401 || result.response.status === 403) {
    result = await sendQuoteRequest<TQuote>({
      baseUrl: options.baseUrl,
      body: options.body,
      idToken: await acquireToken(true),
      fetchImpl,
      timeoutMs,
    });
  }

  if (!result.response.ok || result.payload?.success !== true || !Array.isArray(result.payload.quotes)) {
    const message = String(result.payload?.message || '').trim();
    throw new AuthoritativeQuoteRequestError(message || 'Unable to update fares. Please try again.');
  }

  return result.payload.quotes;
}
