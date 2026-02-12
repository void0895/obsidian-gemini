import { Tool, ToolResult, ToolExecutionContext } from './types';
import { ToolCategory } from '../types/agent';
import type ObsidianGemini from '../main';

export class GoogleSearchTool implements Tool {
	name = 'google_search';
	displayName = 'Web Search';
	category = ToolCategory.READ_ONLY;
	description =
		'Search the web for current information using Groq compound models with built-in web search. Returns an answer plus source links when available.';

	parameters = {
		type: 'object' as const,
		properties: {
			query: {
				type: 'string' as const,
				description: 'The search query to send to the web search engine',
			},
		},
		required: ['query'],
	};

	getProgressDescription(params: { query: string }): string {
		return params.query
			? `Searching web for "${params.query.slice(0, 30)}${params.query.length > 30 ? '...' : ''}"`
			: 'Searching web';
	}

	async execute(params: { query: string }, context: ToolExecutionContext): Promise<ToolResult> {
		const plugin = context.plugin as InstanceType<typeof ObsidianGemini>;
		if (!plugin.settings.apiKey) {
			return { success: false, error: 'Groq API key not configured' };
		}

		try {
			const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${plugin.settings.apiKey}`,
				},
				body: JSON.stringify({
					model: plugin.settings.chatModelName || 'compound',
					temperature: plugin.settings.temperature ?? 0.4,
					messages: [
						{
							role: 'system',
							content:
								'Use the built-in web search capability and provide a concise answer with cited sources when available.',
						},
						{ role: 'user', content: params.query },
					],
					tools: [{ type: 'web_search' }],
					tool_choice: 'auto',
				}),
			});

			if (!response.ok) {
				return { success: false, error: `Web search failed: ${response.status} ${await response.text()}` };
			}

			const result = await response.json();
			const message = result.choices?.[0]?.message;
			const answer = message?.content || 'No answer returned.';
			const citations = (result.citations || result.x_groq?.citations || []).map((c: any) => ({
				title: c.title || c.url,
				url: c.url,
				snippet: c.snippet || '',
			}));

			return {
				success: true,
				data: { query: params.query, answer, citations },
			};
		} catch (error) {
			return {
				success: false,
				error: `Web search failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
			};
		}
	}
}

export function getGoogleSearchTool(): Tool {
	return new GoogleSearchTool();
}
