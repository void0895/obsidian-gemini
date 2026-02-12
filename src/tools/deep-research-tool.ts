import { Tool, ToolResult, ToolExecutionContext } from './types';
import { TFile } from 'obsidian';
import { ToolCategory } from '../types/agent';
import type ObsidianGemini from '../main';
import { ResearchScope } from '../services/deep-research';

export class DeepResearchTool implements Tool {
	name = 'deep_research';
	displayName = 'Deep Research';
	category = ToolCategory.READ_ONLY;
	description =
		'Conduct comprehensive research on a topic using a Groq compound model with web search enabled, then generate a structured markdown report.';
	requiresConfirmation = true;

	parameters = {
		type: 'object' as const,
		properties: {
			topic: { type: 'string' as const, description: 'The research topic or question' },
			scope: {
				type: 'string' as const,
				enum: ['vault_only', 'web_only', 'both'],
				description: 'Research scope hint for the model.',
			},
			outputFile: { type: 'string' as const, description: 'Path for the output report file (optional)' },
		},
		required: ['topic'],
	};

	confirmationMessage = (params: { topic: string; scope?: ResearchScope }) =>
		`Conduct deep research on: "${params.topic}"${params.scope ? ` (${params.scope})` : ''}`;

	getProgressDescription(params: { topic: string; scope?: ResearchScope }): string {
		return `Researching "${params.topic?.slice(0, 25) || 'topic'}${(params.topic || '').length > 25 ? '...' : ''}"`;
	}

	async execute(
		params: { topic: string; scope?: ResearchScope; outputFile?: string },
		context: ToolExecutionContext
	): Promise<ToolResult> {
		const plugin = context.plugin as InstanceType<typeof ObsidianGemini>;
		if (typeof params.topic !== 'string' || params.topic.trim().length === 0) {
			return { success: false, error: 'Topic is required and must be a non-empty string' };
		}
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
					temperature: 0.2,
					messages: [
						{
							role: 'system',
							content:
								'Produce a detailed research report in markdown with clear headings, key findings, and citations/links for claims.',
						},
						{
							role: 'user',
							content: `Topic: ${params.topic}\nScope: ${params.scope || 'both'}\n\nResearch deeply and produce a report.`,
						},
					],
					tools: [{ type: 'web_search' }],
					tool_choice: 'auto',
				}),
			});

			if (!response.ok) {
				return { success: false, error: `Deep research failed: ${response.status} ${await response.text()}` };
			}

			const result = await response.json();
			const report = result.choices?.[0]?.message?.content || '';
			if (!report) {
				return { success: false, error: 'No report generated' };
			}

			let outputPath: string | undefined;
			if (params.outputFile) {
				const normalized = params.outputFile.endsWith('.md') ? params.outputFile : `${params.outputFile}.md`;
				await plugin.app.vault.adapter.write(normalized, report);
				outputPath = normalized;
				if (context.session) {
					const createdFile = plugin.app.vault.getAbstractFileByPath(normalized);
					if (createdFile instanceof TFile) {
						context.session.context.contextFiles.push(createdFile);
					}
				}
			}

			return {
				success: true,
				data: {
					topic: params.topic,
					report,
					sources: (result.citations || result.x_groq?.citations || []).length,
					outputFile: outputPath,
				},
			};
		} catch (error) {
			return {
				success: false,
				error: `Deep research failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
			};
		}
	}
}

export function getDeepResearchTool(): Tool {
	return new DeepResearchTool();
}
