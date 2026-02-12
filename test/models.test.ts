import { GEMINI_MODELS, getDefaultModelForRole, getUpdatedModelSettings, setGeminiModels } from '../src/models';

describe('models (Groq defaults)', () => {
	const original = [...GEMINI_MODELS];

	afterEach(() => {
		setGeminiModels([...original]);
	});

	it('returns role defaults from configured list', () => {
		setGeminiModels([
			{ value: 'compound', label: 'Compound', defaultForRoles: ['chat'] },
			{ value: 'compound-mini', label: 'Compound Mini', defaultForRoles: ['summary'] },
			{ value: 'llama', label: 'Llama', defaultForRoles: ['completions'] },
		]);
		expect(getDefaultModelForRole('chat')).toBe('compound');
		expect(getDefaultModelForRole('summary')).toBe('compound-mini');
		expect(getDefaultModelForRole('completions')).toBe('llama');
	});

	it('updates invalid model settings to current defaults', () => {
		setGeminiModels([
			{ value: 'compound', label: 'Compound', defaultForRoles: ['chat'] },
			{ value: 'compound-mini', label: 'Compound Mini', defaultForRoles: ['summary'] },
			{ value: 'llama', label: 'Llama', defaultForRoles: ['completions'] },
		]);
		const result = getUpdatedModelSettings({
			chatModelName: 'old-chat',
			summaryModelName: 'old-summary',
			completionsModelName: 'old-completions',
			imageModelName: 'old-image',
		});
		expect(result.settingsChanged).toBe(true);
		expect(result.updatedSettings.chatModelName).toBe('compound');
		expect(result.updatedSettings.summaryModelName).toBe('compound-mini');
		expect(result.updatedSettings.completionsModelName).toBe('llama');
		expect(result.updatedSettings.imageModelName).toBe('');
	});

	it('throws when model list is empty and defaults are requested', () => {
		setGeminiModels([]);
		expect(() => getDefaultModelForRole('chat')).toThrow('CRITICAL: GEMINI_MODELS array is empty');
	});
});
