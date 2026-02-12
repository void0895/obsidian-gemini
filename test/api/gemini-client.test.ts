import { TextDecoder } from 'util';
import { GeminiClient } from '../../src/api/gemini-client';

describe('GeminiClient (Groq implementation)', () => {
	beforeEach(() => {
		(global as any).TextDecoder = TextDecoder as any;
		jest.restoreAllMocks();
	});

	it('sends non-streaming chat completion and parses content', async () => {
		const fetchSpy = ((global as any).fetch = jest.fn().mockResolvedValue({
			ok: true,
			json: async () => ({
				choices: [{ message: { content: 'hello from groq' } }],
			}),
		} as any));

		const client = new GeminiClient({ apiKey: 'key', model: 'compound' });
		const res = await client.generateModelResponse({ prompt: 'hello' });
		expect(res.markdown).toBe('hello from groq');
		expect(res.rendered).toBe('');
		expect(fetchSpy).toHaveBeenCalled();
	});

	it('parses tool calls from non-streaming response', async () => {
		(global as any).fetch = jest.fn().mockResolvedValue({
			ok: true,
			json: async () => ({
				choices: [
					{
						message: {
							content: '',
							tool_calls: [{ function: { name: 'search_files', arguments: '{"query":"abc"}' } }],
						},
					},
				],
			}),
		} as any);

		const client = new GeminiClient({ apiKey: 'key', model: 'compound' });
		const res = await client.generateModelResponse({ prompt: 'use tool' });
		expect(res.toolCalls?.[0].name).toBe('search_files');
		expect(res.toolCalls?.[0].arguments).toEqual({ query: 'abc' });
	});

	it('streams content chunks', async () => {
		const payload =
			'data: {"choices":[{"delta":{"content":"Hello "}}]}\n\n' +
			'data: {"choices":[{"delta":{"content":"World"}}]}\n\n' +
			'data: [DONE]\n\n';
		const bytes = new Uint8Array(Buffer.from(payload, 'utf8'));
		const body = {
			getReader: () => {
				let done = false;
				return {
					read: async () => {
						if (done) return { done: true, value: undefined };
						done = true;
						return { done: false, value: bytes };
					},
				};
			},
		};

		(global as any).fetch = jest.fn().mockResolvedValue({ ok: true, body } as any);

		const chunks: string[] = [];
		const client = new GeminiClient({ apiKey: 'key', model: 'compound' });
		const streaming = client.generateStreamingResponse({ prompt: 'stream please' }, (chunk) => chunks.push(chunk.text));
		const result = await streaming.complete;
		expect(chunks.join('')).toBe('Hello World');
		expect(result.markdown).toBe('Hello World');
	});

	it('throws for image generation (unsupported)', async () => {
		const client = new GeminiClient({ apiKey: 'key', model: 'compound' });
		await expect(client.generateImage('cat', 'any')).rejects.toThrow('not supported');
	});
});
