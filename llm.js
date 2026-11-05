// OpenAI-совместимый интерфейс Timeweb AI Gateway.
import { config } from './config.js';

export async function askModel(history) {
  const request = {
    model: config.model,
    messages: [{ role: 'system', content: config.systemPrompt }, ...history],
    max_completion_tokens: 2200,
  };
  if (config.reasoningEffort) request.reasoning_effort = config.reasoningEffort;

  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
    signal: AbortSignal.timeout(45_000),
  });
  if (!response.ok) {
    // Не записываем тело ответа API в журналы (в нём могут быть тексты диалога).
    throw new Error(`LLM HTTP ${response.status}`);
  }
  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) throw new Error('Пустой ответ модели');
  return content
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_`#>]/g, '')
    .replace(/^\s*[-•]\s+/gm, '')
    .trim();
}
