const express = require("express");
const TelegramBot = require("node-telegram-bot-api");
const fs = require("fs");

// ==========================================
//   КОНФИГ
// ==========================================
const BOT_TOKEN     = process.env.BOT_TOKEN || "8598919388:AAFOH5qEHxyn7l9I7EfelQJKdtwjjR1JqVI";
const ADMIN_ID      = parseInt(process.env.ADMIN_ID || "1427796260");
const MESSAGE_NIGHT   = "😴 Килл пошёл спать";
const MESSAGE_MORNING = "☀️ Килл проснулся";
const DB_FILE = "/tmp/subscribers.json";

// ==========================================
//   БАЗА ПОДПИСЧИКОВ (JSON файл)
// ==========================================
function loadSubscribers() {
  try {
    if (fs.existsSync(DB_FILE)) {
      return JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
    }
  } catch (e) {}
  return [];
}

function saveSubscribers(subs) {
  fs.writeFileSync(DB_FILE, JSON.stringify(subs), "utf8");
}

function addSubscriber(from) {
  const subs = loadSubscribers();
  if (subs.find(s => s.id === from.id)) return false;
  subs.push({
    id: from.id,
    username: from.username || "",
    first_name: from.first_name || "",
    last_name: from.last_name || ""
  });
  saveSubscribers(subs);
  return true;
}

function getSubscribersList() {
  const subs = loadSubscribers();
  if (subs.length === 0) return "📭 Подписчиков пока нет.";
  let list = `📋 *Подписчики* (${subs.length} чел.):\n\n`;
  subs.forEach((s, i) => {
    const username = s.username ? `@${s.username}` : "—";
    list += `${i + 1}. ${s.first_name} ${s.last_name} ${username}\n`;
  });
  return list;
}

// ==========================================
//   БОТ
// ==========================================
const app = express();
app.use(express.json());

const bot = new TelegramBot(BOT_TOKEN);

// ==========================================
//   ADMIN MENU
// ==========================================
function sendAdminMenu(chatId) {
  bot.sendMessage(chatId, "👤 *Панель администратора*\nВыберите действие:", {
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: [
        [
          { text: "😴 Ночь",  callback_data: "send_night" },
          { text: "☀️ Утро", callback_data: "send_morning" }
        ],
        [
          { text: "📋 Список подписчиков", callback_data: "list_subs" }
        ]
      ]
    }
  });
}

function sendMessageWithBack(chatId, text) {
  bot.sendMessage(chatId, text, {
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: [[{ text: "↩️ В меню", callback_data: "back_menu" }]]
    }
  });
}

function broadcastMessage(text) {
  const subs = loadSubscribers();
  subs.forEach(s => {
    bot.sendMessage(s.id, text).catch(err => console.log(`Ошибка ${s.id}: ${err.message}`));
  });
  return subs.length;
}

// ==========================================
//   ВЕБХУК
// ==========================================
app.post(`/webhook`, (req, res) => {
  res.sendStatus(200); // сразу отвечаем Telegram

  const update = req.body;

  // Нажатие кнопки
  if (update.callback_query) {
    const query  = update.callback_query;
    const userId = query.from.id;
    const data   = query.data;
    const chatId = query.message.chat.id;
    const msgId  = query.message.message_id;

    bot.answerCallbackQuery(query.id);

    if (userId !== ADMIN_ID) return;

    bot.deleteMessage(chatId, msgId).catch(() => {});

    if (data === "send_night") {
      const count = broadcastMessage(MESSAGE_NIGHT);
      sendMessageWithBack(ADMIN_ID, `✅ «Ночь» отправлено ${count} подписчикам.`);
    } else if (data === "send_morning") {
      const count = broadcastMessage(MESSAGE_MORNING);
      sendMessageWithBack(ADMIN_ID, `✅ «Утро» отправлено ${count} подписчикам.`);
    } else if (data === "list_subs") {
      sendMessageWithBack(ADMIN_ID, getSubscribersList());
    } else if (data === "back_menu") {
      sendAdminMenu(ADMIN_ID);
    }
    return;
  }

  // Обычное сообщение
  if (!update.message) return;

  const msg    = update.message;
  const userId = msg.from.id;
  const text   = (msg.text || "").trim();

  if (text === "/start") {
    if (userId === ADMIN_ID) {
      sendAdminMenu(ADMIN_ID);
    } else {
      const isNew = addSubscriber(msg.from);
      bot.sendMessage(userId, isNew ? "✅ Вы подписались на уведомления!" : "👍 Вы уже подписаны!");
    }
    return;
  }

  if (userId !== ADMIN_ID) return;

  if (text === "/admin" || text === "/menu") {
    sendAdminMenu(ADMIN_ID);
  }
});

app.get("/", (req, res) => res.send("Bot is running!"));

// ==========================================
//   СТАРТ
// ==========================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);

  // Устанавливаем вебхук автоматически
  const url = process.env.WEBHOOK_URL;
  if (url) {
    await bot.setWebHook(`${url}/webhook`);
    console.log(`Webhook set to ${url}/webhook`);
  }
});
