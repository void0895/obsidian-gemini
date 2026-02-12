import { ModelManager } from '../../src/services/model-manager';

describe('ModelManager filterModelsForVersion (Groq)', () => {
	let manager: any;
	let plugin: any;

	beforeEach(() => {
		plugin = {
			settings: { modelDiscovery: { enabled: false, fallbackToStatic: true } },
			logger: { debug: jest.fn(), warn: jest.fn() },
		};
		manager = new ModelManager(plugin);
	});

	it('filters out specialized non-chat models for text list', () => {
		const models = [
			{ value: 'compound', label: 'Compound' },
			{ value: 'text-embedding-3-small', label: 'Embedding' },
			{ value: 'whisper-large-v3', label: 'Whisper' },
			{ value: 'guardrail-model', label: 'Guard' },
			{ value: 'llama-3.3-70b-versatile', label: 'Llama' },
			{ value: 'flux-dev', label: 'Flux', supportsImageGeneration: true },
		];

		const text = manager['filterModelsForVersion'](models, false).map((m: any) => m.value);
		expect(text).toContain('compound');
		expect(text).toContain('llama-3.3-70b-versatile');
		expect(text).not.toContain('text-embedding-3-small');
		expect(text).not.toContain('whisper-large-v3');
		expect(text).not.toContain('guardrail-model');
		expect(text).not.toContain('flux-dev');
	});

	it('returns only image models for image list', () => {
		const models = [
			{ value: 'compound', label: 'Compound' },
			{ value: 'flux-dev', label: 'Flux Dev', supportsImageGeneration: true },
			{ value: 'llava-vision', label: 'Vision' },
		];
		const image = manager['filterModelsForVersion'](models, true).map((m: any) => m.value);
		expect(image).toContain('flux-dev');
		expect(image).toContain('llava-vision');
		expect(image).not.toContain('compound');
	});
});
