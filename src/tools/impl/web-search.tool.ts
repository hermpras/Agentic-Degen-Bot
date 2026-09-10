import { Tool } from '../tool.interface.js';
import { config } from '../../config/index.js';

export const webSearchTool: Tool = {
  name: 'web_search',
  description:
    'Melakukan pencarian web secara real-time untuk menemukan informasi terbaru, berita, fakta, peristiwa terkini, atau informasi dari internet.',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description:
          'Kata kunci atau kalimat pencarian web (contoh: "berita terbaru HoodBear", "update harga Solana")',
      },
    },
    required: ['query'],
  },
  async execute(args: Record<string, any>) {
    const query = args.query;
    const apiKey = config.tavilyApiKey;

    if (!apiKey) {
      return JSON.stringify({
        error:
          'TAVILY_API_KEY belum diisi di file .env. Harap isi TAVILY_API_KEY untuk menggunakan pencarian web.',
      });
    }

    if (!query || typeof query !== 'string') {
      return JSON.stringify({
        error: 'Parameter "query" wajib diisi dengan string pencarian yang valid.',
      });
    }

    try {
      console.log(`🌐 [WebSearch] Mencari di web via Tavily API: "${query}"`);

      const response = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          api_key: apiKey,
          query: query,
          search_depth: 'basic',
          max_results: 5,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ [WebSearch Error] HTTP ${response.status}:`, errorText);
        return JSON.stringify({
          error: `Gagal menghubungi API Tavily (HTTP ${response.status}).`,
        });
      }

      const data = (await response.json()) as {
        results?: Array<{ title: string; url: string; content: string }>;
      };

      if (!data.results || data.results.length === 0) {
        return JSON.stringify({
          message: `Tidak ada hasil pencarian ditemukan untuk "${query}".`,
        });
      }

      const formattedResults = data.results.map((item) => ({
        title: item.title,
        url: item.url,
        snippet: item.content,
      }));

      return JSON.stringify({
        query: query,
        resultsCount: formattedResults.length,
        results: formattedResults,
      });
    } catch (error: any) {
      console.error('❌ [WebSearch Exception]:', error);
      return JSON.stringify({
        error: `Terjadi kesalahan saat melakukan pencarian web: ${error.message || String(error)}`,
      });
    }
  },
};
