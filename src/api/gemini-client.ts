import {
	ModelApi,
	BaseModelRequest,
	ExtendedModelRequest,
	ModelResponse,
	ToolCall,
	StreamCallback,
	StreamingModelResponse,
	ToolDefinition,
} from './interfaces/model-api';
import { GeminiPrompts } from '../prompts';
import type ObsidianGemini from '../main';
import { getDefaultModelForRole } from '../models';

export interface GeminiClientConfig {
	apiKey: string;
	model?: string;
	temperature?: number;
	topP?: number;
	maxOutputTokens?: number;
	streamingEnabled?: boolean;
}

type ChatMessage = {
	role: 'system' | 'user' | 'assistant' | 'tool';
	content: string;
	tool_call_id?: string;
	name?: string;
	tool_calls?: Array<{
		id: string;
		type: 'function';
		function: { name: string; arguments: string };
	}>;
};

export class GeminiClient implements ModelApi {
	private config: GeminiClientConfig;
	private prompts: GeminiPrompts;
	private plugin?: ObsidianGemini;
	private readonly apiBase = 'https://api.groq.com/openai/v1';

	constructor(config: GeminiClientConfig, prompts?: GeminiPrompts, plugin?: ObsidianGemini) {
		this.config = {
			temperature: 0.7,
			topP: 0.95,
			streamingEnabled: true,
			...config,
		};
		this.plugin = plugin;
		this.prompts = prompts || new GeminiPrompts(plugin);
	}

	async generateModelResponse(request: BaseModelRequest | ExtendedModelRequest): Promise<ModelResponse> {
		const payload = await this.buildRequestPayload(request, false);
		const response = await this.requestChatCompletion(payload);
		return this.extractResponse(response);
	}

	generateStreamingResponse(
		request: BaseModelRequest | ExtendedModelRequest,
		onChunk: StreamCallback
	): StreamingModelResponse {
		let cancelled = false;
		let markdown = '';
		let rendered = '';
		let toolCalls: ToolCall[] | undefined;

		const complete = (async (): Promise<ModelResponse> => {
			const payload = await this.buildRequestPayload(request, true);
			const streamResponse = await fetch(`${this.apiBase}/chat/completions`, {
				method: 'POST',
				headers: this.getHeaders(),
				body: JSON.stringify(payload),
			});

			if (!streamResponse.ok || !streamResponse.body) {
				const errorText = await streamResponse.text();
				throw new Error(`Groq streaming request failed: ${streamResponse.status} ${errorText}`);
			}

			const reader = streamResponse.body.getReader();
			const decoder = new TextDecoder();
			let buffer = '';
			const toolCallBuffer = new Map<number, { id?: string; name?: string; arguments: string }>();

			while (!cancelled) {
				const { done, value } = await reader.read();
				if (done) {
					break;
				}

				buffer += decoder.decode(value, { stream: true });
				const events = buffer.split('\n\n');
				buffer = events.pop() || '';

				for (const event of events) {
					for (const line of event.split('\n')) {
						if (!line.startsWith('data: ')) {
							continue;
						}
						const data = line.slice(6).trim();
						if (!data || data === '[DONE]') {
							continue;
						}

						const chunk = JSON.parse(data);
						const delta = chunk.choices?.[0]?.delta;
						const text = delta?.content || '';
						if (text) {
							markdown += text;
							onChunk({ text });
						}

						if (delta?.tool_calls?.length) {
							for (const tc of delta.tool_calls) {
								const index = tc.index ?? 0;
								const existing = toolCallBuffer.get(index) || { arguments: '' };
								if (tc.id) {
									existing.id = tc.id;
								}
								if (tc.function?.name) {
									existing.name = tc.function.name;
								}
								if (tc.function?.arguments) {
									existing.arguments += tc.function.arguments;
								}
								toolCallBuffer.set(index, existing);
							}
						}
					}
				}
			}

			if (toolCallBuffer.size > 0) {
				toolCalls = Array.from(toolCallBuffer.values())
					.filter((tc) => tc.name)
					.map((tc) => ({
						name: tc.name!,
						arguments: this.parseJson(tc.arguments),
					}));
			}

			return { markdown, rendered, ...(toolCalls && { toolCalls }) };
		})();

		return { complete, cancel: () => (cancelled = true) };
	}

	private async buildRequestPayload(
		request: BaseModelRequest | ExtendedModelRequest,
		stream: boolean
	): Promise<Record<string, any>> {
		const model = request.model || this.config.model || getDefaultModelForRole('chat');
		const isExtended = 'userMessage' in request;

		const messages: ChatMessage[] = [];
		if (isExtended) {
			const extReq = request as ExtendedModelRequest;
			let agentsMemory: string | null = null;
			if (this.plugin?.agentsMemory) {
				try {
					agentsMemory = await this.plugin.agentsMemory.read();
				} catch (error) {
					this.plugin?.logger.warn('Failed to load AGENTS.md:', error);
				}
			}

			let systemInstruction = this.prompts.getSystemPromptWithCustom(
				extReq.availableTools,
				extReq.customPrompt,
				agentsMemory
			);
			if (extReq.prompt && !extReq.customPrompt?.overrideSystemPrompt) {
				systemInstruction += `\n\n${extReq.prompt}`;
			}

			messages.push({ role: 'system', content: systemInstruction });
			messages.push(...this.normalizeConversation(extReq.conversationHistory || []));

			const userContent = extReq.imageAttachments?.length
				? `${extReq.userMessage}\n\n[Image attachments were provided but are not currently supported by Groq text endpoints.]`
				: extReq.userMessage;
			messages.push({ role: 'user', content: userContent });
		} else {
			messages.push({ role: 'user', content: request.prompt });
		}

		const payload: Record<string, any> = {
			model,
			messages,
			temperature: request.temperature ?? this.config.temperature,
			top_p: request.topP ?? this.config.topP,
			stream,
		};

		if (this.config.maxOutputTokens) {
			payload.max_tokens = this.config.maxOutputTokens;
		}

		if (isExtended && (request as ExtendedModelRequest).availableTools?.length) {
			payload.tools = this.mapTools((request as ExtendedModelRequest).availableTools!);
			payload.tool_choice = 'auto';
		}

		return payload;
	}

	private normalizeConversation(history: any[]): ChatMessage[] {
		const messages: ChatMessage[] = [];
		for (const item of history) {
			if (!item) continue;
			const role = item.role;
			if (!['user', 'assistant', 'tool', 'system'].includes(role)) continue;

			if (role === 'assistant' && item.tool_calls) {
				messages.push({ role, content: item.content || '', tool_calls: item.tool_calls });
				continue;
			}

			if (role === 'tool') {
				messages.push({ role, content: item.content || '', tool_call_id: item.tool_call_id, name: item.name });
				continue;
			}

			const content =
				typeof item.content === 'string' ? item.content : (item.parts?.map((p: any) => p.text).join('\n') ?? '');
			messages.push({ role, content });
		}
		return messages;
	}

	private mapTools(tools: ToolDefinition[]): Array<{ type: 'function'; function: ToolDefinition }> {
		return tools.map((tool) => ({ type: 'function', function: tool }));
	}

	private async requestChatCompletion(payload: Record<string, any>): Promise<any> {
		const response = await fetch(`${this.apiBase}/chat/completions`, {
			method: 'POST',
			headers: this.getHeaders(),
			body: JSON.stringify(payload),
		});

		if (!response.ok) {
			const errorText = await response.text();
			this.plugin?.logger.error('[GeminiClient] Groq request failed:', errorText);
			throw new Error(`Groq request failed: ${response.status} ${errorText}`);
		}

		return response.json();
	}

	private extractResponse(response: any): ModelResponse {
		const choice = response.choices?.[0]?.message;
		const markdown = choice?.content || '';
		const toolCalls = choice?.tool_calls?.length
			? choice.tool_calls.map((tc: any) => ({
					name: tc.function?.name,
					arguments: this.parseJson(tc.function?.arguments),
				}))
			: undefined;

		return {
			markdown,
			rendered: '',
			...(toolCalls && { toolCalls }),
		};
	}

	private parseJson(value: string | undefined): Record<string, any> {
		if (!value) {
			return {};
		}
		try {
			return JSON.parse(value);
		} catch {
			return { raw: value };
		}
	}

	private getHeaders(): Record<string, string> {
		return {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${this.config.apiKey}`,
		};
	}

	async generateImage(_prompt: string, _model: string): Promise<string> {
		throw new Error('Image generation is not supported by the Groq API in this plugin build.');
	}
}
