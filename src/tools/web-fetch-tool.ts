import { Tool, ToolResult, ToolExecutionContext } from './types';
import { ToolCategory } from '../types/agent';
import type ObsidianGemini from '../main';
import { requestUrlWithRetry } from '../utils/proxy-fetch';
import TurndownService from 'turndown';
import { decodeHtmlEntities } from '../utils/html-entities';

export class WebFetchTool implements Tool {
	name = 'web_fetch';
	displayName = 'Web Fetch';
	category = ToolCategory.READ_ONLY;
	description =
		'Fetch and analyze content from a URL. Uses direct HTTP fetch and summarizes with a Groq compound model for targeted extraction.';

	parameters = {
		type: 'object' as const,
		properties: {
			url: { type: 'string' as const, description: 'URL to fetch' },
			query: { type: 'string' as const, description: 'What to extract/analyze from the page' },
		},
		required: ['url', 'query'],
	};

	getProgressDescription(params: { url: string }): string {
		return params.url ? `Fetching ${params.url.slice(0, 35)}${params.url.length > 35 ? '...' : ''}` : 'Fetching URL';
	}

	async execute(params: { url: string; query: string }, context: ToolExecutionContext): Promise<ToolResult> {
		const plugin = context.plugin as InstanceType<typeof ObsidianGemini>;
		if (!plugin.settings.apiKey) {
			return { success: false, error: 'Groq API key not configured' };
		}
		return this.fallbackFetch(params, plugin);
	}

	private async fallbackFetch(
		params: { url: string; query: string },
		plugin: InstanceType<typeof ObsidianGemini>
	): Promise<ToolResult> {
		try {
			const response = await requestUrlWithRetry({
				url: params.url,
				method: 'GET',
				headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ObsidianGemini/1.0)' },
			});

			if (response.status !== 200) {
				return { success: false, error: `HTTP ${response.status}: ${response.text || 'Failed to fetch URL'}` };
			}

			const rawHtml = response.text;
			const titleMatch = rawHtml.match(/<title[^>]*>([^<]+)<\/title>/i);
			const title = titleMatch ? decodeHtmlEntities(titleMatch[1].trim()) : params.url;

			const turndownService = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });
			turndownService.remove(['script', 'style', 'nav', 'footer', 'noscript']);
			let content = turndownService.turndown(rawHtml);
			if (content.length > 16000) {
				content = `${content.substring(0, 16000)}\n\n[Content truncated...]`;
			}

			const summarizeResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${plugin.settings.apiKey}`,
				},
				body: JSON.stringify({
					model: plugin.settings.chatModelName || 'compound',
					temperature: plugin.settings.temperature || 0.3,
					messages: [
						{ role: 'system', content: 'Answer the user query strictly based on the page content provided.' },
						{
							role: 'user',
							content: `URL: ${params.url}\nTitle: ${title}\nQuery: ${params.query}\n\nPage content:\n${content}`,
						},
					],
				}),
			});

			if (!summarizeResponse.ok) {
				return {
					success: false,
					error: `Groq analysis failed: ${summarizeResponse.status} ${await summarizeResponse.text()}`,
				};
			}

			const result = await summarizeResponse.json();
			const analysisText = result.choices?.[0]?.message?.content || '';
			if (!analysisText) {
				return { success: false, error: 'No analysis generated from page content' };
			}

			return {
				success: true,
				data: {
					url: params.url,
					query: params.query,
					content: analysisText,
					title,
					fetchedAt: new Date().toISOString(),
				},
			};
		} catch (error) {
			plugin.logger.error('Web fetch error:', error);
			return {
				success: false,
				error: `Web fetch failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
			};
		}
	}
}
