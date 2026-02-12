import ObsidianGemini from '../main';

export interface GoogleModel {
	name: string;
	displayName: string;
	description: string;
	version: string;
	inputTokenLimit: number;
	outputTokenLimit: number;
	supportedGenerationMethods: string[];
	baseModelId?: string;
	maxTemperature?: number;
	topP?: number;
	topK?: number;
}

export interface ModelDiscoveryResult {
	models: GoogleModel[];
	lastUpdated: number;
	success: boolean;
	error?: string;
}

export class ModelDiscoveryService {
	private plugin: ObsidianGemini;
	private cache: ModelDiscoveryResult | null = null;
	private readonly CACHE_DURATION = 24 * 60 * 60 * 1000;
	private readonly API_BASE = 'https://api.groq.com/openai/v1';

	constructor(plugin: ObsidianGemini) {
		this.plugin = plugin;
	}

	async discoverModels(forceRefresh = false): Promise<ModelDiscoveryResult> {
		if (!forceRefresh && this.cache && this.isCacheValid()) {
			return this.cache;
		}

		try {
			const models = await this.fetchModelsFromAPI();
			const result: ModelDiscoveryResult = { models, lastUpdated: Date.now(), success: true };
			this.cache = result;
			await this.persistCache(result);
			return result;
		} catch (error) {
			const result: ModelDiscoveryResult = {
				models: [],
				lastUpdated: Date.now(),
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error',
			};
			return this.cache || result;
		}
	}

	private async fetchModelsFromAPI(): Promise<GoogleModel[]> {
		const apiKey = this.plugin.settings.apiKey;
		if (!apiKey) {
			throw new Error('API key not configured');
		}

		const response = await fetch(`${this.API_BASE}/models`, {
			headers: { Authorization: `Bearer ${apiKey}` },
		});
		if (!response.ok) {
			throw new Error(`API request failed: ${response.status} ${response.statusText}`);
		}

		const data = await response.json();
		const models = (data.data || [])
			.filter((model: any) => this.isGenerativeModel(model))
			.map(
				(model: any) =>
					({
						name: model.id,
						displayName: model.id,
						description: model.owned_by || 'Groq model',
						version: 'latest',
						inputTokenLimit: 131072,
						outputTokenLimit: 8192,
						supportedGenerationMethods: ['generateContent'],
						maxTemperature: 2,
						topP: 1,
					}) as GoogleModel
			);

		return models;
	}

	private isGenerativeModel(model: any): boolean {
		const id = String(model.id || '').toLowerCase();
		return !!id && !id.includes('whisper') && !id.includes('tts') && !id.includes('vision-preview');
	}

	private isCacheValid(): boolean {
		return !!(this.cache && Date.now() - this.cache.lastUpdated < this.CACHE_DURATION);
	}

	private async persistCache(result: ModelDiscoveryResult): Promise<void> {
		const data = (await this.plugin.loadData()) || {};
		data.modelDiscoveryCache = result;
		await this.plugin.saveData(data);
	}

	async loadCache(): Promise<void> {
		const data = (await this.plugin.loadData()) || {};
		this.cache = data.modelDiscoveryCache || null;
	}

	clearCache(): void {
		this.cache = null;
	}

	getCacheInfo(): { hasCache: boolean; isValid: boolean; lastUpdated?: number } {
		return {
			hasCache: !!this.cache,
			isValid: this.isCacheValid(),
			lastUpdated: this.cache?.lastUpdated,
		};
	}
}
