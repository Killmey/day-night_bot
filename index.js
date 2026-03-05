const express = require("express");
const TelegramBot = require("node-telegram-bot-api");
const { MongoClient } = require("mongodb");

// ==========================================
//   КОНФИГ
// ==========================================
const BOT_TOKEN     = process.env.BOT_TOKEN || "8598919388:AAFOH5qEHxyn7l9I7EfelQJKdtwjjR1JqVI";
const ADMIN_ID      = parseInt(process.env.ADMIN_ID || "1427796260");
const MONGODB_URI   = process.env.MONGODB_URI;
const MESSAGE_NIGHT   = "😴 Килл пошёл спать";
const MESSAGE_MORNING = "☀️ Килл проснулся";

// ==========================================
//   MONGODB
// ==========================================
let db;
async function getDb() {
  if (db) return db;
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  db = client.db("killbot");
  return db;
}

async function addSubscriber(from) {
  const col = (await getDb()).collection("subscribers");
  const exists = await col.findOne({ id: from.id });
  if (exists) return false;
  await col.insertOne({
    id: from.id,
    username: from.username || "",
    first_name: from.first_name || "",
    last_name: from.last_name || "",
    subscribed_at: new Date()
  });
  return true;
}

async function loadSubscribers() {
  const col = (await getDb()).collection("subscribers");
  return col.find({}).toArray();
}

async function getSubscribersList() {
  const subs = await loadSubscribers();
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

async function broadcastMessage(text) {
  const subs = await loadSubscribers();
  subs.forEach(s => {
    bot.sendMessage(s.id, text).catch(err => console.log(`Ошибка ${s.id}: ${err.message}`));
  });
  return subs.length;
}

// ==========================================
//   ВЕБХУК
// ==========================================
app.post("/webhook", async (req, res) => {
  res.sendStatus(200);

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
      const count = await broadcastMessage(MESSAGE_NIGHT);
      sendMessageWithBack(ADMIN_ID, `✅ «Ночь» отправлено ${count} подписчикам.`);
    } else if (data === "send_morning") {
      const count = await broadcastMessage(MESSAGE_MORNING);
      sendMessageWithBack(ADMIN_ID, `✅ «Утро» отправлено ${count} подписчикам.`);
    } else if (data === "list_subs") {
      const list = await getSubscribersList();
      sendMessageWithBack(ADMIN_ID, list);
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
      const isNew = await addSubscriber(msg.from);
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
  const url = process.env.WEBHOOK_URL;
  if (url) {
    await bot.setWebHook(`${url}/webhook`);
    console.log(`Webhook set to ${url}/webhook`);
  }
});
