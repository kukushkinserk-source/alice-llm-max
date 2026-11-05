// Настройки — секреты задаются только в Timeweb App Platform или локальном .env.
export const config = {
  port: Number(process.env.PORT || 3000),
  apiKey: process.env.API_KEY,
  baseUrl: (process.env.BASE_URL || 'https://api.timeweb.ai/v1').replace(/\/$/, ''),
  model: process.env.MODEL || 'deepseek/deepseek-v4.1-flash',
  reasoningEffort: process.env.REASONING_EFFORT || '',
  skillId: process.env.ALICE_SKILL_ID || '',
  webhookSecret: process.env.ALICE_WEBHOOK_SECRET || '',
  waitForAnswerMs: 3200,
  maxHistory: 20,
  systemPrompt: process.env.SYSTEM_PROMPT || `Ты голосовой помощник внутри Яндекс Станции. Отвечай по-русски, дружелюбно, точно и по делу.
Ответ зачитывается голосом: без markdown, таблиц, эмодзи и длинных URL.
Обычно отвечай кратко, но если пользователь попросил подробности — объясняй развёрнуто. Не обрывай ответ ради ограничения в 1024 символа: программа прочитает его по частям.`,
};
