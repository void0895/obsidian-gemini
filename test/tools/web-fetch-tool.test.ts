import { WebFetchTool } from '../../src/tools/web-fetch-tool';
import { requestUrlWithRetry } from '../../src/utils/proxy-fetch';

jest.mock('../../src/utils/proxy-fetch', () => ({
	requestUrlWithRetry: jest.fn(),
}));

describe('WebFetchTool', () => {
	let tool: WebFetchTool;
	let context: any;

	beforeEach(() => {
		jest.restoreAllMocks();
		tool = new WebFetchTool();
		context = {
			plugin: {
				settings: { apiKey: 'key', chatModelName: 'compound', temperature: 0.3 },
				logger: { error: jest.fn() },
			},
		};
	});

	it('has expected metadata', () => {
		expect(tool.name).toBe('web_fetch');
		expect(tool.category).toBe('read_only');
		expect(tool.parameters.required).toEqual(['url', 'query']);
	});

	it('returns key error when key missing', async () => {
		context.plugin.settings.apiKey = '';
		const res = await tool.execute({ url: 'https://example.com', query: 'summary' }, context);
		expect(res.success).toBe(false);
		expect(res.error).toContain('API key');
	});

	it('fetches page and summarizes via groq', async () => {
		(requestUrlWithRetry as jest.Mock).mockResolvedValue({
			status: 200,
			text: '<html><head><title>Example</title></head><body><h1>Hello</h1><p>World</p></body></html>',
		});
		(global as any).fetch = jest.fn().mockResolvedValue({
			ok: true,
			json: async () => ({ choices: [{ message: { content: 'Summary result' } }] }),
		} as any);

		const res = await tool.execute({ url: 'https://example.com', query: 'summarize it' }, context);
		expect(res.success).toBe(true);
		expect((res.data as any).content).toBe('Summary result');
	});

	it('returns HTTP error from fallback fetch', async () => {
		(requestUrlWithRetry as jest.Mock).mockResolvedValue({ status: 403, text: 'Denied' });
		const res = await tool.execute({ url: 'https://example.com', query: 'summarize it' }, context);
		expect(res.success).toBe(false);
		expect(res.error).toContain('HTTP 403');
	});
});
