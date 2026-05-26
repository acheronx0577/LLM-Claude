import {
  assertAllowedFetchUrl,
  fetchAllowed,
  sanitizeSearchQuery,
} from "./fetchSecurity.ts";

type SearchResult = {
  title: string;
  url: string;
  snippet: string;
};

const MAX_SEARCH_RESULT_CHARS = 2500;

function decodeDuckDuckGoUrl(href: string): string {
  const normalized = href.replace(/&amp;/g, "&");
  const match = normalized.match(/uddg=([^&]+)/);
  if (match) {
    return decodeURIComponent(match[1]);
  }
  if (normalized.startsWith("//")) {
    return `https:${normalized}`;
  }
  return normalized;
}

function stripHtml(text: string): string {
  return text
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function formatResults(results: SearchResult[]): string {
  if (results.length === 0) {
    return "No search results found.";
  }

  const formatted = results
    .map(
      (result, index) =>
        `${index + 1}. ${result.title}\nURL: ${result.url}\n${result.snippet}`,
    )
    .join("\n\n");

  if (formatted.length <= MAX_SEARCH_RESULT_CHARS) {
    return formatted;
  }

  return `${formatted.slice(0, MAX_SEARCH_RESULT_CHARS)}\n\n[Results truncated]`;
}

async function searchTavily(query: string, apiKey: string): Promise<string> {
  const response = await fetchAllowed("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      max_results: 5,
    }),
  });

  if (!response.ok) {
    throw new Error(`Tavily search failed: ${response.status}`);
  }

  const data = (await response.json()) as {
    results?: Array<{ title: string; url: string; content: string }>;
  };

  const results =
    data.results?.map((result) => ({
      title: result.title,
      url: result.url,
      snippet: result.content,
    })) ?? [];

  return formatResults(results);
}

async function searchBrave(query: string, apiKey: string): Promise<string> {
  const url = assertAllowedFetchUrl(
    new URL("https://api.search.brave.com/res/v1/web/search"),
  );
  url.searchParams.set("q", query);
  url.searchParams.set("count", "5");

  const response = await fetchAllowed(url, {
    headers: {
      Accept: "application/json",
      "X-Subscription-Token": apiKey,
    },
  });

  if (!response.ok) {
    throw new Error(`Brave search failed: ${response.status}`);
  }

  const data = (await response.json()) as {
    web?: {
      results?: Array<{ title: string; url: string; description: string }>;
    };
  };

  const results =
    data.web?.results?.map((result) => ({
      title: result.title,
      url: result.url,
      snippet: result.description,
    })) ?? [];

  return formatResults(results);
}

async function searchDuckDuckGo(query: string): Promise<string> {
  const url = assertAllowedFetchUrl(
    new URL("https://html.duckduckgo.com/html/"),
  );
  url.searchParams.set("q", query);

  const response = await fetchAllowed(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; LLM-Claude/1.0)",
    },
  });

  if (!response.ok) {
    throw new Error(`DuckDuckGo search failed: ${response.status}`);
  }

  const html = await response.text();
  const linkRe =
    /class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  const snippetRe = /class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
  const links = [...html.matchAll(linkRe)].slice(0, 5);
  const snippets = [...html.matchAll(snippetRe)].slice(0, 5);
  const results: SearchResult[] = [];

  for (const [index, match] of links.entries()) {
    results.push({
      title: stripHtml(match[2]),
      url: decodeDuckDuckGoUrl(match[1]),
      snippet: snippets[index] ? stripHtml(snippets[index][1]) : "",
    });
  }

  const zeroClickMatch = html.match(
    /id="zero_click_abstract"[\s\S]*?<\/a>\s*([\s\S]*?)<a rel="nofollow" href="https:\/\/en\.wikipedia\.org/,
  );
  if (zeroClickMatch) {
    const summary = stripHtml(zeroClickMatch[1]);
    if (summary) {
      results.unshift({
        title: "Instant answer",
        url: "https://duckduckgo.com",
        snippet: summary,
      });
    }
  }

  return formatResults(results.slice(0, 5));
}

export async function webSearch(query: string): Promise<string> {
  const safeQuery = sanitizeSearchQuery(query);
  const tavilyApiKey = process.env.TAVILY_API_KEY;
  const braveApiKey = process.env.BRAVE_SEARCH_API_KEY;

  if (tavilyApiKey) {
    return searchTavily(safeQuery, tavilyApiKey);
  }

  if (braveApiKey) {
    return searchBrave(safeQuery, braveApiKey);
  }

  return searchDuckDuckGo(safeQuery);
}
