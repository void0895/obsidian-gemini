import { DeepResearchTool, getDeepResearchTool } from '../../src/tools/deep-research-tool';

describe('DeepResearchTool', () => {
	let tool: DeepResearchTool;
	let context: any;

	beforeEach(() => {
		jest.restoreAllMocks();
		tool = new DeepResearchTool();
		context = {
			plugin: {
				settings: { apiKey: 'key', chatModelName: 'compound' },
				app: {
					vault: {
						adapter: { write: jest.fn().mockResolvedValue(undefined) },
						getAbstractFileByPath: jest.fn().mockReturnValue(null),
					},
				},
			},
			session: { context: { contextFiles: [] } },
		};
	});

	it('has expected metadata', () => {
		expect(tool.name).toBe('deep_research');
		expect(tool.category).toBe('read_only');
		expect(tool.requiresConfirmation).toBe(true);
		expect(tool.description).toContain('Groq compound');
	});

	it('formats confirmation/progress messages', () => {
		expect(tool.confirmationMessage!({ topic: 'AI', scope: 'vault_only' })).toContain('vault_only');
		expect(tool.getProgressDescription({ topic: 'Test topic' })).toContain('Researching');
	});

	it('validates missing/invalid topic', async () => {
		let res = await tool.execute({ topic: '' } as any, context);
		expect(res.success).toBe(false);
		res = await tool.execute({ topic: 123 as any } as any, context);
		expect(res.success).toBe(false);
	});

	it('returns key error when key missing', async () => {
		context.plugin.settings.apiKey = '';
		const res = await tool.execute({ topic: 'AI' }, context);
		expect(res.success).toBe(false);
		expect(res.error).toContain('API key');
	});

	it('handles successful research response', async () => {
		(global as any).fetch = jest.fn().mockResolvedValue({
			ok: true,
			json: async () => ({
				choices: [{ message: { content: '# Report\n\nDetails' } }],
				citations: [{ url: 'https://example.com' }],
			}),
		} as any);

		const res = await tool.execute({ topic: 'AI', outputFile: 'Research/ai.md' }, context);
		expect(res.success).toBe(true);
		expect((res.data as any).report).toContain('# Report');
		expect(context.plugin.app.vault.adapter.write).toHaveBeenCalled();
	});

	it('factory returns tool', () => {
		expect(getDeepResearchTool()).toBeInstanceOf(DeepResearchTool);
	});
});
