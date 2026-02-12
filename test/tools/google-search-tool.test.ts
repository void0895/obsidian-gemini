import { GoogleSearchTool, getGoogleSearchTool } from '../../src/tools/google-search-tool';
import { ToolExecutionContext } from '../../src/tools/types';

describe('GoogleSearchTool', () => {
	let tool: GoogleSearchTool;
	let mockContext: ToolExecutionContext;

	beforeEach(() => {
		jest.restoreAllMocks();
		tool = new GoogleSearchTool();
		mockContext = {
			plugin: {
				settings: {
					apiKey: 'test-api-key',
					chatModelName: 'compound',
					temperature: 0.7,
				},
			},
		} as any;
	});

	it('has expected metadata', () => {
		expect(tool.name).toBe('google_search');
		expect(tool.category).toBe('read_only');
		expect(tool.description).toContain('Groq compound');
		expect(tool.parameters.required).toEqual(['query']);
	});

	it('returns missing key error', async () => {
		(mockContext.plugin as any).settings.apiKey = '';
		const result = await tool.execute({ query: 'test' }, mockContext);
		expect(result.success).toBe(false);
		expect(result.error).toContain('API key');
	});

	it('handles successful response', async () => {
		(global as any).fetch = jest.fn().mockResolvedValue({
			ok: true,
			json: async () => ({
				choices: [{ message: { content: 'answer text' } }],
				x_groq: { citations: [{ url: 'https://example.com', title: 'Example' }] },
			}),
		} as any);

		const result = await tool.execute({ query: 'latest updates' }, mockContext);
		expect(result.success).toBe(true);
		expect((result.data as any).answer).toBe('answer text');
		expect((result.data as any).citations[0].url).toBe('https://example.com');
	});

	it('handles API failures', async () => {
		(global as any).fetch = jest.fn().mockRejectedValue(new Error('network'));
		const result = await tool.execute({ query: 'latest updates' }, mockContext);
		expect(result.success).toBe(false);
		expect(result.error).toContain('Web search failed');
	});

	it('getGoogleSearchTool factory returns instance', () => {
		expect(getGoogleSearchTool()).toBeInstanceOf(GoogleSearchTool);
	});
});
