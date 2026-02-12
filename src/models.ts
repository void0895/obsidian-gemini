export type ModelRole = 'chat' | 'summary' | 'completions' | 'rewrite' | 'image';

export interface GeminiModel {
	value: string;
	label: string;
	defaultForRoles?: ModelRole[];
	supportsImageGeneration?: boolean;
}

export const DEFAULT_GEMINI_MODELS: GeminiModel[] = [
	{ value: 'compound', label: 'Compound', defaultForRoles: ['chat', 'rewrite'] },
	{ value: 'compound-mini', label: 'Compound Mini', defaultForRoles: ['summary'] },
	{ value: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B Versatile', defaultForRoles: ['completions'] },
	{ value: 'openai/gpt-oss-120b', label: 'GPT OSS 120B' },
	{ value: 'moonshotai/kimi-k2-instruct-0905', label: 'Kimi K2 Instruct 0905' },
	{ value: 'deepseek-r1-distill-llama-70b', label: 'DeepSeek R1 Distill Llama 70B' },
	{ value: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B Instant' },
];

export let GEMINI_MODELS: GeminiModel[] = [...DEFAULT_GEMINI_MODELS];

export function setGeminiModels(newModels: GeminiModel[]): void {
	GEMINI_MODELS.length = 0;
	GEMINI_MODELS.push(...newModels);
}

export function getDefaultModelForRole(role: ModelRole): string {
	const modelForRole = GEMINI_MODELS.find((m) => m.defaultForRoles?.includes(role));
	if (modelForRole) {
		return modelForRole.value;
	}
	if (GEMINI_MODELS.length > 0) {
		return GEMINI_MODELS[0].value;
	}
	throw new Error('CRITICAL: GEMINI_MODELS array is empty. Please configure available models.');
}

export interface ModelUpdateResult {
	updatedSettings: any;
	settingsChanged: boolean;
	changedSettingsInfo: string[];
}

export function getUpdatedModelSettings(currentSettings: any): ModelUpdateResult {
	const availableModelValues = new Set(GEMINI_MODELS.map((m) => m.value));
	let settingsChanged = false;
	const changedSettingsInfo: string[] = [];
	const newSettings = { ...currentSettings };

	const needsUpdate = (modelName: string) => !modelName || !availableModelValues.has(modelName);

	if (needsUpdate(newSettings.chatModelName)) {
		const next = getDefaultModelForRole('chat');
		changedSettingsInfo.push(`Chat model: '${newSettings.chatModelName}' -> '${next}' (model update)`);
		newSettings.chatModelName = next;
		settingsChanged = true;
	}
	if (needsUpdate(newSettings.summaryModelName)) {
		const next = getDefaultModelForRole('summary');
		changedSettingsInfo.push(`Summary model: '${newSettings.summaryModelName}' -> '${next}' (model update)`);
		newSettings.summaryModelName = next;
		settingsChanged = true;
	}
	if (needsUpdate(newSettings.completionsModelName)) {
		const next = getDefaultModelForRole('completions');
		changedSettingsInfo.push(`Completions model: '${newSettings.completionsModelName}' -> '${next}' (model update)`);
		newSettings.completionsModelName = next;
		settingsChanged = true;
	}
	if (newSettings.imageModelName && needsUpdate(newSettings.imageModelName)) {
		changedSettingsInfo.push(`Image model '${newSettings.imageModelName}' is not available on Groq and was cleared.`);
		newSettings.imageModelName = '';
		settingsChanged = true;
	}

	return { updatedSettings: newSettings, settingsChanged, changedSettingsInfo };
}
