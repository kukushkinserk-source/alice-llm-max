// Внешний HTTPS webhook для приватного навыка Яндекс Диалогов.
import express from 'express';
import { config } from './config.js';
import { makeAnswer } from './alice.js';

if (!config.apiKey) {
  console.error('Не задан API_KEY');
  process.exit(1);
}
if (config.webhookSecret.length < 24) {
  console.error('Не задан ALICE_WEBHOOK_SECRET (не менее 24 случайных символов)');
  process.exit(1);
}

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '32kb' }));
app.get(['/', '/health'], (_req, res) => res.type('text/plain').send('ok'));

app.post('/hook/:secret', async (req, res) => {
  // Секретный URL — дополнительная защита от постороннего расходования API-ключа.
  // Сам по себе skill_id НЕ является подтверждением подлинности отправителя.
  if (req.params.secret !== config.webhookSecret) return res.sendStatus(404);
  const alice = req.body;
  if (!alice || typeof alice !== 'object' ||
      typeof alice.session?.session_id !== 'string' ||
      typeof alice.request !== 'object' ||
      typeof alice.version !== 'string') {
    return res.sendStatus(400);
  }
  if (config.skillId && alice.session.skill_id !== config.skillId) {
    return res.sendStatus(403);
  }
  try {
    const answer = await makeAnswer(alice);
    res.json({ version: alice.version, response: { text: answer.text, end_session: answer.endSession } });
  } catch (error) {
    console.error('Ошибка обработки обращения:', error?.name || 'unknown');
    res.status(500).json({ version: alice.version,
      response: { text: 'Произошла ошибка, попробуй повторить вопрос.', end_session: false } });
  }
});

// Не логируем ни фразы пользователя, ни ответы модели, ни секретный URL.
app.listen(config.port, '0.0.0.0', () => {
  console.log(`Навык запущен на порту ${config.port}; модель ${config.model}`);
});
