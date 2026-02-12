import { ModelDiscoveryService } from '../../src/services/model-discovery';

describe('ModelDiscoveryService', () => {
	let plugin: any;
	let service: ModelDiscoveryService;

	beforeEach(() => {
		jest.restoreAllMocks();
		plugin = {
			settings: { apiKey: 'test-key' },
			loadData: jest.fn().mockResolvedValue({}),
			saveData: jest.fn().mockResolvedValue(undefined),
			logger: { warn: jest.fn() },
		};
		service = new ModelDiscoveryService(plugin);
	});

	it('discovers and maps groq models', async () => {
		(global as any).fetch = jest.fn().mockResolvedValue({
			ok: true,
			status: 200,
			statusText: 'OK',
			json: async () => ({
				data: [
					{ id: 'compound', owned_by: 'groq' },
					{ id: 'whisper-large-v3', owned_by: 'groq' },
				],
			}),
		} as any);

		const result = await service.discoverModels(true);
		expect(result.success).toBe(true);
		expect(result.models.some((m) => m.name === 'compound')).toBe(true);
		expect(result.models.some((m) => m.name.includes('whisper'))).toBe(false);
		expect(plugin.saveData).toHaveBeenCalled();
	});

	it('returns failure when key missing', async () => {
		plugin.settings.apiKey = '';
		const result = await service.discoverModels(true);
		expect(result.success).toBe(false);
	});

	it('uses cache when valid and not force refreshed', async () => {
		(global.fetch as any) = jest.fn();
		(service as any).cache = { models: [{ name: 'compound' }], lastUpdated: Date.now(), success: true };
		const result = await service.discoverModels(false);
		expect(result.success).toBe(true);
		expect(global.fetch).not.toHaveBeenCalled();
	});
});
