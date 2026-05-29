const MAX_SEARCH_QUERY_LENGTH = 500;

// fallow-ignore-file security-sink

const ALLOWED_FETCH_HOSTS = new Set([
  "api.tavily.com",
  "api.search.brave.com",
  "html.duckduckgo.com",
  "duckduckgo.com",
]);

class FetchSecurityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FetchSecurityError";
  }
}

export function sanitizeSearchQuery(query: string): string {
  const trimmed = query.trim();

  if (!trimmed) {
    throw new FetchSecurityError("Search query is empty");
  }

  if (trimmed.length > MAX_SEARCH_QUERY_LENGTH) {
    throw new FetchSecurityError("Search query is too long");
  }

  if (/[\0\r\n]/.test(trimmed)) {
    throw new FetchSecurityError("Search query contains invalid characters");
  }

  return trimmed;
}

export function assertAllowedFetchUrl(url: string | URL): URL {
  const parsed = typeof url === "string" ? new URL(url) : url;

  if (parsed.protocol !== "https:") {
    throw new FetchSecurityError(`Blocked fetch protocol: ${parsed.protocol}`);
  }

  if (!ALLOWED_FETCH_HOSTS.has(parsed.hostname)) {
    throw new FetchSecurityError(`Blocked fetch host: ${parsed.hostname}`);
  }

  return parsed;
}

export async function fetchAllowed(
  url: string | URL,
  init?: RequestInit,
): Promise<Response> {
  return fetch(assertAllowedFetchUrl(url), init);
}
