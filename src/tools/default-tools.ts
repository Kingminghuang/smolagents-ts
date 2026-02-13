import { BaseTool } from './base-tool.js';
import type { ToolInput } from '../types/index.js';


/**
 * Final answer tool - used to return the final answer to the user
 */
export class FinalAnswerTool extends BaseTool {
  name = 'final_answer';
  description =
    'Provides the final answer to the user. Must be called when you have completed the task.';

  inputs: Record<string, ToolInput> = {
    answer: {
      type: 'any',
      description: 'The final answer to return to the user',
    },
  };

  output_type = 'any';

  override forward(inputs: { answer: unknown }): Promise<unknown> {
    return Promise.resolve(inputs.answer);
  }
}

type SearchEngine = 'duckduckgo' | 'bing';

type SearchResult = {
  title: string;
  link: string;
  description: string;
};

type SearchToolOptions = {
  engine?: SearchEngine;
  maxResults?: number;
  useMock?: boolean;
  mockResults?: SearchResult[];
};

const defaultMockResults: SearchResult[] = [
  {
    title: 'Example Result 1',
    link: 'https://example.com/1',
    description: 'Mock result used when real search is disabled.',
  },
  {
    title: 'Example Result 2',
    link: 'https://example.com/2',
    description: 'Replace with real results when USE_REAL_DATA is true.',
  },
  {
    title: 'Example Result 3',
    link: 'https://example.com/3',
    description: 'Default mock data for offline tests and local runs.',
  },
];

const readUseRealData = (): boolean => {
  const globalEnv = globalThis as typeof globalThis & {
    process?: { env?: Record<string, string | undefined> };
    __TEST_ENV__?: Record<string, string | undefined>;
  };
  const value =
    globalEnv.__TEST_ENV__?.['USE_REAL_DATA'] ?? globalEnv.process?.env?.['USE_REAL_DATA'];
  return (value ?? '').toLowerCase() === 'true';
};

const decodeHtml = (value: string): string =>
  value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');

const stripHtml = (value: string): string =>
  decodeHtml(value.replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();

const formatResults = (results: SearchResult[]): string => {
  if (results.length === 0) {
    return 'No results found.';
  }

  return (
    '## Search Results\n\n' +
    results
      .map((result) => `[${result.title}](${result.link})\n${result.description}`.trim())
      .join('\n\n')
  );
};

/**
 * Search tool - performs a web search and returns formatted results
 */
export class SearchTool extends BaseTool {
  name = 'search';
  description =
    'Performs a web search for a query and returns the top results formatted as markdown.';

  inputs: Record<string, ToolInput> = {
    query: {
      type: 'string',
      description: 'The search query',
    },
    max_results: {
      type: 'number',
      description: 'Maximum number of results to return',
      default: 10,
    },
    engine: {
      type: 'string',
      description: 'Search engine to use: duckduckgo or bing',
      default: 'duckduckgo',
      enum: ['duckduckgo', 'bing'],
    },
  };

  output_type = 'string';

  private readonly engine: SearchEngine;
  private readonly maxResults: number;
  private readonly useMock: boolean;
  private readonly mockResults: SearchResult[];

  constructor(options: SearchToolOptions = {}) {
    super();
    this.engine = options.engine ?? 'duckduckgo';
    this.maxResults = options.maxResults ?? 10;
    this.useMock = options.useMock ?? !readUseRealData();
    this.mockResults = options.mockResults ?? defaultMockResults;
  }

  override async forward(args: {
    query: string;
    max_results?: number;
    engine?: SearchEngine;
  }): Promise<string> {
    const maxResults = Math.max(1, Math.floor(args.max_results ?? this.maxResults));

    if (this.useMock) {
      return formatResults(this.mockResults.slice(0, maxResults));
    }

    const engine = args.engine ?? this.engine;

    const results = await this.search(engine, args.query, maxResults);
    if (results.length === 0) {
      throw new Error('No results found! Try a less restrictive or shorter query.');
    }
    return formatResults(results);
  }

  private async search(
    engine: SearchEngine,
    query: string,
    maxResults: number
  ): Promise<SearchResult[]> {
    if (engine === 'duckduckgo') {
      return this.searchDuckDuckGo(query, maxResults);
    }
    if (engine === 'bing') {
      return this.searchBing(query, maxResults);
    }
    throw new Error('Unsupported engine');
  }

  private async searchDuckDuckGo(query: string, maxResults: number): Promise<SearchResult[]> {
    const url = new URL('https://lite.duckduckgo.com/lite/');
    url.searchParams.set('q', query);

    const response = await fetch(url.toString(), {
      headers: {
        'User-Agent': 'Mozilla/5.0',
      },
    });

    if (!response.ok) {
      throw new Error(`DuckDuckGo request failed with status ${response.status}`);
    }

    const html = await response.text();
    const results: SearchResult[] = [];

    const resultRegex =
      /<a[^>]*class="result-link"[^>]*href="(?<href>[^"]+)"[^>]*>(?<title>[\s\S]*?)<\/a>[\s\S]*?<span[^>]*class="link-text"[^>]*>(?<link>[\s\S]*?)<\/span>[\s\S]*?<td[^>]*class="result-snippet"[^>]*>(?<desc>[\s\S]*?)<\/td>/g;

    for (const match of html.matchAll(resultRegex)) {
      if (results.length >= maxResults) {
        break;
      }
      const groups = match.groups as Record<string, string> | undefined;
      const title = stripHtml(groups?.['title'] ?? '');
      const linkText = stripHtml(groups?.['link'] ?? '');
      const description = stripHtml(groups?.['desc'] ?? '');
      const href = decodeHtml(groups?.['href'] ?? '').trim();
      const link = href || (linkText ? `https://${linkText}` : '');

      if (title && link) {
        results.push({ title, link, description });
      }
    }

    if (results.length > 0) {
      return results;
    }

    const fallbackRegex =
      /<a[^>]*class="result-link"[^>]*href="(?<href>[^"]+)"[^>]*>(?<title>[\s\S]*?)<\/a>/g;
    for (const match of html.matchAll(fallbackRegex)) {
      if (results.length >= maxResults) {
        break;
      }
      const groups = match.groups as Record<string, string> | undefined;
      const title = stripHtml(groups?.['title'] ?? '');
      const href = decodeHtml(groups?.['href'] ?? '').trim();
      if (title && href) {
        results.push({ title, link: href, description: '' });
      }
    }

    return results;
  }

  private async searchBing(query: string, maxResults: number): Promise<SearchResult[]> {
    const url = new URL('https://www.bing.com/search');
    url.searchParams.set('q', query);
    url.searchParams.set('format', 'rss');

    const response = await fetch(url.toString());
    if (!response.ok) {
      throw new Error(`Bing request failed with status ${response.status}`);
    }

    const xml = await response.text();
    const results: SearchResult[] = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;

    for (const match of xml.matchAll(itemRegex)) {
      if (results.length >= maxResults) {
        break;
      }
      const item = match[1] ?? '';
      const titleMatch = item.match(/<title>([\s\S]*?)<\/title>/i);
      const linkMatch = item.match(/<link>([\s\S]*?)<\/link>/i);
      const descMatch = item.match(/<description>([\s\S]*?)<\/description>/i);
      const title = stripHtml(titleMatch?.[1] ?? '');
      const link = stripHtml(linkMatch?.[1] ?? '');
      const description = stripHtml(descMatch?.[1] ?? '');

      if (title && link) {
        results.push({ title, link, description });
      }
    }

    return results;
  }
}

/**
 * Code executor tool - placeholder for code execution
 */
export class CodeExecutorTool extends BaseTool {
  name = 'execute_code';
  description = 'Executes Python code and returns the output.';

  inputs: Record<string, ToolInput> = {
    code: {
      type: 'string',
      description: 'Python code to execute',
    },
  };

  output_type = 'string';

  override forward(args: { code: string }): Promise<string> {
    return Promise.resolve(
      `Code execution output (placeholder):\n\nCode:\n${args.code}\n\nThis is a placeholder. Integrate with a real code execution environment.`
    );
  }
}
