// Память диалога и произнесение длинных ответов частями.
import { config } from './config.js';
import { askModel } from './llm.js';

const EXIT_WORDS = new Set(['хватит', 'стоп', 'выход', 'пока', 'закончить']);
const CONTINUE_WORDS = new Set(['дальше', 'ну', 'ну что', 'ну что там', 'что там', 'продолжай', 'давай', 'готово', 'следующая часть']);
const MAX_CHUNK = 900; // 1024 у Яндекса на одно поле; запас на подсказку.
const MORE = ' Скажи «продолжай».';
const dialogs = new Map();

function getDialog(sessionId) {
  // Ограничиваем накопление старых сессий (один процесс, без внешней БД).
  const now = Date.now();
  for (const [id, entry] of dialogs) {
    if (now - entry.lastSeen > 45 * 60_000) dialogs.delete(id);
  }
  if (!dialogs.has(sessionId)) {
    if (dialogs.size >= 200) dialogs.delete(dialogs.keys().next().value);
    dialogs.set(sessionId, { history: [], pendingAnswer: null, chunks: [], lastSeen: now });
  }
  const dialog = dialogs.get(sessionId);
  dialog.lastSeen = now;
  return dialog;
}

function normalize(s) {
  return String(s || '').toLowerCase().replace(/[.,!?«»]/g, '').replace(/^алиса\s+/, '').trim();
}

function say(text, endSession = false) {
  if (text.length > 1024) throw new Error('Ответ превышает лимит Яндекса');
  return { text, endSession };
}

export function splitForSpeech(text, maxLen = MAX_CHUNK) {
  let remaining = String(text || '').replace(/\s+/g, ' ').trim();
  const chunks = [];
  while (remaining.length > maxLen) {
    let cut = -1;
    const minCut = Math.floor(maxLen * 0.50);
    for (let i = maxLen - 1; i >= minCut; i--) {
      if (/[.!?;]/.test(remaining[i]) && /\s/.test(remaining[i + 1] || '')) {
        cut = i + 1; break;
      }
    }
    if (cut < 0) {
      cut = remaining.lastIndexOf(' ', maxLen);
      if (cut <= 0) cut = maxLen;
    }
    chunks.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trim();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

function nextChunk(dialog) {
  const chunk = dialog.chunks.shift();
  return say(chunk + (dialog.chunks.length ? MORE : ''));
}

function present(dialog, answer) {
  dialog.chunks = splitForSpeech(answer || 'Модель вернула пустой ответ.');
  return nextChunk(dialog);
}

async function askAndRemember(dialog, question) {
  dialog.history.push({ role: 'user', content: question });
  try {
    const answer = await askModel(dialog.history);
    dialog.history.push({ role: 'assistant', content: answer });
    if (dialog.history.length > config.maxHistory) {
      dialog.history = dialog.history.slice(-config.maxHistory);
    }
    return answer;
  } catch (err) {
    // Не протоколируем полный ответ API: он может содержать личные данные.
    console.error('Ошибка обращения к LLM:', err?.name || 'unknown');
    dialog.history.pop();
    return 'Не получилось связаться с нейросетью. Попробуй ещё раз.';
  }
}

async function deliver(dialog, entry, waitText) {
  const answer = await Promise.race([
    entry.promise,
    new Promise(resolve => setTimeout(() => resolve(null), config.waitForAnswerMs)),
  ]);
  if (answer === null) return say(waitText);
  if (dialog.pendingAnswer !== entry) return say('Я уже обрабатываю следующий вопрос. Скажи «дальше».');
  dialog.pendingAnswer = null;
  return present(dialog, answer);
}

export async function makeAnswer(alice) {
  const sessionId = alice.session.session_id;
  // request.original_utterance при запуске навыка содержит фразу активации,
  // а request.command — только команду после активационного имени.
  // Пустая command — значимый случай, НЕ заменяем её полной фразой.
  const rawCommand = typeof alice.request.command === 'string'
    ? alice.request.command : (alice.request.original_utterance || '');
  const userText = String(rawCommand).trim().slice(0, 2000);
  const command = normalize(userText);
  const dialog = getDialog(sessionId);

  if (userText === 'ping') return say('pong');
  if (alice.session.new && !userText) return say('Привет! Я на связи, спрашивай что угодно.');
  if (EXIT_WORDS.has(command)) {
    dialogs.delete(sessionId);
    return say('Давай, до связи!', true);
  }
  if (CONTINUE_WORDS.has(command)) {
    if (dialog.chunks.length) return nextChunk(dialog);
    if (dialog.pendingAnswer) return deliver(dialog, dialog.pendingAnswer, 'Ещё думаю, скажи «дальше» через пару секунд.');
    return say('Пока продолжать нечего. Задай новый вопрос.');
  }
  if (!userText) return say('Я слушаю. Спроси что-нибудь.');

  // Новый вопрос сбрасывает непрочитанную часть старого ответа.
  dialog.chunks = [];
  const previous = dialog.pendingAnswer?.promise || Promise.resolve();
  const entry = { promise: previous.then(() => askAndRemember(dialog, userText)) };
  dialog.pendingAnswer = entry;
  return deliver(dialog, entry, 'Секунду, думаю. Скажи «дальше».');
}
