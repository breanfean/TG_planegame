// TG Gambling Funnel Bot — EN/RU with Tier-1 language choice + WEBHOOK mode
// Node 18+, Telegraf + Express. Replace in-memory storage with DB/Redis for prod.

import 'dotenv/config';
import express from 'express';
import bodyParser from 'body-parser';
import { Telegraf, Markup } from 'telegraf';

// ====== ENV ======
const {
  BOT_TOKEN,
  AFFILIATE_REGISTER_URL,
  AFFILIATE_DEPOSIT_URL,
  POSTBACK_SECRET,
  PORT = 3000,
  WEBHOOK_URL, // e.g. https://yourapp.onrender.com/tg
} = process.env;
if (!BOT_TOKEN) throw new Error('BOT_TOKEN is required');

const bot = new Telegraf(BOT_TOKEN);

// ====== In-memory store (replace with real DB) ======
const users = new Map(); // key: userId, val: { lang, age_ok, nick, status, payload, timers: [] }
const segments = { new: new Set(), clicked_register: new Set(), registered: new Set(), deposited: new Set() };

function getUser(ctx) {
  const id = ctx.from?.id;
  if (!users.has(id)) {
    users.set(id, { lang: null, age_ok: false, nick: null, status: 'new', payload: '', timers: [] });
    segments.new.add(id);
  }
  return users.get(id);
}
function setStatus(userId, next) {
  for (const k of Object.keys(segments)) segments[k].delete(userId);
  if (!segments[next]) segments[next] = new Set();
  segments[next].add(userId);
  const u = users.get(userId);
  if (u) u.status = next;
}
function clearTimers(u) {
  u.timers.forEach(t => clearTimeout(t));
  u.timers = [];
}
function schedule(u, fn, ms) {
  const t = setTimeout(fn, ms);
  u.timers.push(t);
}

// ====== i18n dictionary (EN + RU) ======
const i18n = {
  en: {
    lang_prompt: 'Choose your language / Wähle deine Sprache / Choisis ta langue / Elige tu idioma / Scegli la tua lingua',
    langs: { en: 'English 🇺🇸', de: 'Deutsch 🇩🇪', fr: 'Français 🇫🇷', es: 'Español 🇪🇸', it: 'Italiano 🇮🇹', ru: 'Русский 🇷🇺' },

    age_title: 'Adults only',
    age_text: 'This channel is for persons 18+ only. By continuing you confirm you are 18+ and accept the Terms.',
    btn_yes18: 'I am 18+ ✅',
    btn_rules: 'Rules & 18+',

    hi: name => `Hi, ${name || 'friend'}! 🎉 You’ve entered a private bonus hub.\nFirst deposit bonus: **+100% up to $50** + 20 FS. Want to claim it?`,
    btn_claim: 'Claim bonus 🎁',
    btn_how: 'How it works ❓',
    btn_help: 'Help 🆘',
    btn_deposit: 'Deposit 💳',
    btn_bonus: 'My bonus 🎁',
    btn_payouts: 'Payouts 🏆',
    btn_back: 'Back',
    how_text: '3 steps:\n1) Register via our partner link\n2) Make your first deposit\n3) Bonus will be added automatically.',
    rules_text: '18+ only. Gambling involves risk. No guaranteed winnings. Follow your local laws. T&C apply.',
    ask_nick: 'Great — send your casino nickname, or let me generate one.',
    btn_enter_nick: 'Enter nickname ✍️',
    btn_gen_nick: 'Generate nickname 🎲',
    nick_saved: n => `Nice, I’ve saved your nickname: ${n}`,
    reg_link_text: 'Perfect! Your private link is ready. Tap to register and unlock your bonus:',
    btn_register: 'Register now 🚀',
    followup_30m: 'Still there? 👀 Your bonus waits for you — valid for 60 minutes. Tap to claim +100%.',
    followup_24h: 'Last chance: +100% on first deposit expires soon. Want me to keep it for you?',
    registered_ok: n => `✅ Registration confirmed, ${n || 'player'}! Make your first deposit — the bonus will be auto-applied.`,
    btn_go_deposit: 'Deposit now 💳',
    deposited_ok: '🎉 Congrats — your bonus is active! +100% up to $50 and 20 FS are in your account.',
    reactivation_7d: 'We’ve added +10% to your next deposit for 48h. Want to activate?',
    help_text: 'FAQ: KYC, payments, withdrawals. Need a human? Tap below.',
    btn_support: 'Contact support 👤',
  },

  ru: {
    lang_prompt: 'Выберите язык / Wähle deine Sprache / Choisis ta langue / Elige tu idioma / Scegli la tua lingua',
    langs: { en: 'English 🇺🇸', de: 'Deutsch 🇩🇪', fr: 'Français 🇫🇷', es: 'Español 🇪🇸', it: 'Italiano 🇮🇹', ru: 'Русский 🇷🇺' },

    age_title: 'Только 18+',
    age_text: 'Канал доступен только совершеннолетним (18+). Продолжая, вы подтверждаете возраст 18+ и согласие с правилами.',
    btn_yes18: 'Мне 18+ ✅',
    btn_rules: 'Правила & 18+',

    hi: name => `Привет, ${name || 'друг'}! 🎉 Ты попал(а) в закрытый хаб бонусов.\nЗа первый депозит — **+100% до $50** и 20 фриспинов. Забираем?`,
    btn_claim: 'Забрать бонус 🎁',
    btn_how: 'Как это работает ❓',
    btn_help: 'Помощь 🆘',
    btn_deposit: 'Пополнить 💳',
    btn_bonus: 'Мой бонус 🎁',
    btn_payouts: 'Выплаты 🏆',
    btn_back: 'Назад',
    how_text: '3 шага:\n1) Зарегистрируйся по нашей ссылке\n2) Сделай первый депозит\n3) Бонус начислится автоматически.',
    rules_text: 'Только 18+. Азартные игры — это риск. Нет гарантированных выигрышей. Соблюдай законы своей страны. Правила действуют.',
    ask_nick: 'Отлично — пришли свой ник в казино, либо сгенерировать?',
    btn_enter_nick: 'Ввести ник ✍️',
    btn_gen_nick: 'Сгенерировать ник 🎲',
    nick_saved: n => `Супер, сохранил твой ник: ${n}`,
    reg_link_text: 'Готово! Твоя приватная ссылка на регистрацию ниже — переходи и активируй бонус:',
    btn_register: 'Зарегистрироваться 🚀',
    followup_30m: 'Ты ещё тут? 👀 Бонус ждёт — действует 60 минут. Жми, пока доступно +100%.',
    followup_24h: 'Последний шанс: +100% на первый депозит скоро истекает. Сохранить бонус?',
    registered_ok: n => `✅ Регистрация подтверждена, ${n || 'игрок'}! Пополняй счёт — бонус придёт автоматически.`,
    btn_go_deposit: 'Пополнить сейчас 💳',
    deposited_ok: '🎉 Поздравляем — бонус активирован! +100% до $50 и 20 фриспинов уже в аккаунте.',
    reactivation_7d: 'Добавили +10% к следующему депозиту на 48 часов. Активировать?',
    help_text: 'FAQ: верификация, платежи, выводы. Нужен менеджер? Нажми ниже.',
    btn_support: 'Связаться с поддержкой 👤',
  },
};

function t(lang, key, ...args) {
  const L = i18n[lang] ? i18n[lang] : i18n.en;
  const val = L[key];
  return typeof val === 'function' ? val(...args) : val;
}

// ====== Keyboards ======
function langKb() {
  const row1 = [
    Markup.button.callback(i18n.en.langs.en, 'lang:en'),
    Markup.button.callback(i18n.en.langs.ru, 'lang:ru'),
  ];
  const row2 = [
    Markup.button.callback(i18n.en.langs.de, 'lang:de'),
    Markup.button.callback(i18n.en.langs.fr, 'lang:fr'),
  ];
  const row3 = [
    Markup.button.callback(i18n.en.langs.es, 'lang:es'),
    Markup.button.callback(i18n.en.langs.it, 'lang:it'),
  ];
  return Markup.inlineKeyboard([row1, row2, row3]);
}

function ageKb(lang) {
  return Markup.inlineKeyboard([
    [Markup.button.callback(t(lang, 'btn_yes18'), 'age:yes')],
    [Markup.button.callback(t(lang, 'btn_rules'), 'show:rules')],
  ]);
}

function mainMenuKb(lang) {
  return Markup.keyboard([
    [t(lang, 'btn_claim'), t(lang, 'btn_how')],
    [t(lang, 'btn_bonus'), t(lang, 'btn_deposit')],
    [t(lang, 'btn_payouts'), t(lang, 'btn_help')],
  ]).resize();
}

function nickKb(lang) {
  return Markup.inlineKeyboard([
    [Markup.button.callback(t(lang, 'btn_enter_nick'), 'nick:enter')],
    [Markup.button.callback(t(lang, 'btn_gen_nick'), 'nick:gen')],
    [Markup.button.callback(t(lang, 'btn_back'), 'nav:back')],
  ]);
}

function registerKb(lang, url) {
  return Markup.inlineKeyboard([
    [Markup.button.url(t(lang, 'btn_register'), url)],
  ]);
}

function depositKb(lang, url) {
  return Markup.inlineKeyboard([
    [Markup.button.url(t(lang, 'btn_go_deposit'), url)],
  ]);
}

// ====== Helpers ======
const SUPPORTED_LANGS = new Set(['en', 'ru']);
function resolveLang(code) {
  return SUPPORTED_LANGS.has(code) ? code : 'en'; // default EN for Tier-1
}
function genNick() {
  const animals = ['Falcon', 'Eagle', 'Wolf', 'Tiger', 'Fox', 'Hawk', 'Raven', 'Shark'];
  return `Player_${animals[Math.floor(Math.random()*animals.length)]}_${Math.floor(1000+Math.random()*8999)}`;
}
function buildRegisterUrl(userId, payload, lang) {
  const p = new URL(AFFILIATE_REGISTER_URL);
  p.searchParams.set('uid', String(userId));
  if (payload) p.searchParams.set('src', payload);
  p.searchParams.set('lang', lang);
  return p.toString();
}
function buildDepositUrl(userId, payload, lang) {
  const p = new URL(AFFILIATE_DEPOSIT_URL);
  p.searchParams.set('uid', String(userId));
  if (payload) p.searchParams.set('src', payload);
  p.searchParams.set('lang', lang);
  return p.toString();
}

// ====== Start flow ======
bot.start(async (ctx) => {
  const u = getUser(ctx);
  u.payload = ctx.startPayload || '';
  u.lang = u.lang || null;
  u.age_ok = u.age_ok || false;
  clearTimers(u);

  // Language choice
  await ctx.reply(i18n.en.lang_prompt, langKb());

  // Fallback to EN if user ignores language
  schedule(u, async () => {
    if (!u.lang) {
      u.lang = 'en';
      await ctx.reply(`${t(u.lang, 'age_title')}\n\n${t(u.lang, 'age_text')}`, ageKb(u.lang));
    }
  }, 60_000);
});

// ====== Callback handlers ======
bot.on('callback_query', async (ctx) => {
  const data = ctx.callbackQuery.data;
  const u = getUser(ctx);

  if (data.startsWith('lang:')) {
    const chosen = data.split(':')[1];
    u.lang = resolveLang(chosen);
    await ctx.answerCbQuery();
    await ctx.editMessageReplyMarkup();
    return ctx.reply(`${t(u.lang, 'age_title')}\n\n${t(u.lang, 'age_text')}`, ageKb(u.lang));
  }

  if (data === 'age:yes') {
    u.age_ok = true;
    await ctx.answerCbQuery('✔');
    await ctx.editMessageReplyMarkup();
    await ctx.reply(t(u.lang || 'en', 'hi', ctx.from?.first_name), mainMenuKb(u.lang || 'en'));
    return;
  }

  if (data === 'show:rules') {
    await ctx.answerCbQuery();
    return ctx.reply(t(u.lang || 'en', 'rules_text'));
  }

  if (data === 'nav:back') {
    await ctx.answerCbQuery();
    return ctx.reply(t(u.lang || 'en', 'hi', ctx.from?.first_name), mainMenuKb(u.lang || 'en'));
  }

  if (data === 'nick:enter') {
    await ctx.answerCbQuery();
    u.awaiting_nick = true;
    return ctx.reply(t(u.lang || 'en', 'ask_nick'));
  }
  if (data === 'nick:gen') {
    await ctx.answerCbQuery();
    u.nick = genNick();
    await ctx.reply(t(u.lang || 'en', 'nick_saved', u.nick));

    const regUrl = buildRegisterUrl(ctx.from.id, u.payload, u.lang || 'en');
    await ctx.reply(t(u.lang || 'en', 'reg_link_text'), registerKb(u.lang || 'en', regUrl));
    setStatus(ctx.from.id, 'clicked_register');

    clearTimers(u);
    schedule(u, async () => ctx.reply(t(u.lang || 'en', 'followup_30m')), 30 * 60 * 1000);
    schedule(u, async () => ctx.reply(t(u.lang || 'en', 'followup_24h')), 24 * 60 * 60 * 1000);
    return;
  }

  await ctx.answerCbQuery('OK');
});

// ====== Text handlers ======
bot.hears([(ctx) => !!ctx.message?.text], async (ctx, next) => {
  const u = getUser(ctx);
  const lang = u.lang || 'en';
  const txt = ctx.message.text;
  const L = i18n[lang];

  if (u.awaiting_nick) {
    u.awaiting_nick = false;
    u.nick = txt.trim().slice(0, 32);
    await ctx.reply(t(lang, 'nick_saved', u.nick));
    const regUrl = buildRegisterUrl(ctx.from.id, u.payload, lang);
    await ctx.reply(t(lang, 'reg_link_text'), registerKb(lang, regUrl));
    setStatus(ctx.from.id, 'clicked_register');

    clearTimers(u);
    schedule(u, async () => ctx.reply(t(lang, 'followup_30m')), 30 * 60 * 1000);
    schedule(u, async () => ctx.reply(t(lang, 'followup_24h')), 24 * 60 * 60 * 1000);
    return;
  }

  switch (txt) {
    case L.btn_how:
      return ctx.reply(L.how_text, Markup.inlineKeyboard([[Markup.button.callback(L.btn_back, 'nav:back')]]));
    case L.btn_claim:
    case L.btn_bonus:
      return ctx.reply(L.ask_nick, nickKb(lang));
    case L.btn_deposit: {
      const depUrl = buildDepositUrl(ctx.from.id, u.payload, lang);
      return ctx.reply(L.registered_ok(u.nick), depositKb(lang, depUrl));
    }
    case L.btn_payouts:
      return ctx.reply('Top payouts are updated daily. (Stub — integrate your feed here).');
    case L.btn_help:
      return ctx.reply(L.help_text, Markup.inlineKeyboard([[Markup.button.callback(L.btn_support, 'support:human')]]));
    default:
      return next();
  }
});

bot.action('support:human', async (ctx) => {
  await ctx.answerCbQuery();
  return ctx.reply('Support will contact you soon. (Stub: route to live agent).');
});

// ====== Express server for postbacks ======
const app = express();
app.use(bodyParser.json());

// Basic health
app.get('/', (req, res) => res.send('OK'));

// Secured postbacks
function auth(req, res, next) {
  const sig = req.headers['x-postback-secret'];
  if (POSTBACK_SECRET && sig !== POSTBACK_SECRET) return res.status(401).json({ ok: false });
  next();
}
app.post('/postback/registered', auth, async (req, res) => {
  const { uid } = req.body || {};
  const id = Number(uid);
  const u = users.get(id);
  if (!u) return res.json({ ok: true, msg: 'user not found (ok) });
  setStatus(id, 'registered');
  clearTimers(u);
  const lang = u.lang || 'en';
  const depUrl = buildDepositUrl(id, u.payload, lang);
  try {
    await bot.telegram.sendMessage(id, t(lang, 'registered_ok', u.nick), depositKb(lang, depUrl));
    schedule(u, async () => bot.telegram.sendMessage(id, t(lang, 'reactivation_7d')), 48 * 60 * 60 * 1000);
  } catch {}
  res.json({ ok: true });
});
app.post('/postback/deposited', auth, async (req, res) => {
  const { uid } = req.body || {};
  const id = Number(uid);
  const u = users.get(id);
  if (!u) return res.json({ ok: true, msg: 'user not found (ok) });
  setStatus(id, 'deposited');
  clearTimers(u);
  const lang = u.lang || 'en';
  try { await bot.telegram.sendMessage(id, t(lang, 'deposited_ok')); } catch {}
  res.json({ ok: true });
});

// ====== Launch mode (single mode only) ======
bot.catch((err) => console.error('Bot error:', err));
process.on('unhandledRejection', console.error);
process.on('uncaughtException', console.error);

async function bootstrap() {
  try {
    const info = await bot.telegram.getWebhookInfo();
    console.log('Current webhook info:', info);
  } catch {}

  if (WEBHOOK_URL) {
    // --- WEBHOOK MODE ---
    const path = new URL(WEBHOOK_URL).pathname || '/tg';

    // включаем webhook и чистим «хвосты»
    await bot.telegram.setWebhook(WEBHOOK_URL, { drop_pending_updates: true });
    console.log('Webhook set to', WEBHOOK_URL);

    // вешаем обработчик до listen
    app.use(path, bot.webhookCallback(path));

    // стартуем сервер
    app.listen(PORT, () => console.log(`HTTP on :${PORT} (webhook mode)`));

    // ВАЖНО: НЕ вызывать bot.launch() в webhook-режиме
  } else {
    // --- POLLING MODE (локально) ---
    await bot.telegram.deleteWebhook({ drop_pending_updates: true });
    await bot.launch();
    console.log('Bot started (polling mode)');
    app.listen(PORT, () => console.log(`HTTP on :${PORT}`));
  }
}

bootstrap().catch((e) => {
  console.error('Bootstrap error:', e);
  process.exit(1);
});

// Graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
