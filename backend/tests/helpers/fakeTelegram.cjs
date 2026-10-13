// Soxta Telegram Bot API serveri — haqiqiy Telegraf bot shu serverga ulanadi
// (TELEGRAM_API_ROOT), ya'ni bot kodi o'zgarishsiz, tarmoqqa chiqmasdan sinaladi.
//
//   const tg = await startFakeTelegram();
//   process.env.TELEGRAM_API_ROOT = tg.url;
//   tg.push({ message: { ... } });           // foydalanuvchi xabari
//   await tg.until((calls) => calls.some(...)); // bot javobini kutish
const http = require('http');

async function startFakeTelegram(opts = {}) {
  const calls = [];
  const queue = [];
  let waiters = [];
  let updateId = 1;
  let messageId = 5000;
  const username = opts.username || 'denta_yordam_bot';

  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', async () => {
      const url = req.url.split('?')[0];
      // Fayl yuklab olish (getFileLink): ovozli xabar baytlari
      if (url.startsWith('/file/')) {
        res.setHeader('content-type', 'audio/ogg');
        res.end(Buffer.from('soxta-ovoz'));
        return;
      }
      const method = url.split('/').pop();
      let params = {};
      try { params = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}; } catch { params = {}; }
      const ok = (result) => {
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ ok: true, result }));
      };
      if (method === 'getUpdates') {
        if (!queue.length) {
          await new Promise((resolve) => {
            const timer = setTimeout(resolve, 200);
            waiters.push(() => { clearTimeout(timer); resolve(); });
          });
        }
        return ok(queue.splice(0));
      }
      const call = { method, ...params };
      calls.push(call);
      if (opts.fail && opts.fail[method]) {
        res.statusCode = opts.fail[method];
        res.setHeader('content-type', 'application/json');
        return res.end(JSON.stringify({ ok: false, error_code: opts.fail[method], description: 'soxta xato' }));
      }
      if (method === 'getMe') return ok({ id: 1, is_bot: true, first_name: 'Yordam', username });
      if (method === 'getFile') return ok({ file_id: params.file_id, file_path: 'voice/file.oga' });
      if (/^send(Message|Photo|Document)$/.test(method)) {
        // Bot olgan xabar raqami — test kartaga reply/tugma yuborishda shuni ishlatadi
        call.sentMessageId = messageId++;
        return ok({ message_id: call.sentMessageId, chat: { id: params.chat_id }, date: 0, text: params.text });
      }
      return ok(true);
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  return {
    url: `http://127.0.0.1:${server.address().port}`,
    username,
    calls,
    /** Botga "kelgan" hodisa: { message }, { callback_query } */
    push(update) {
      queue.push({ update_id: updateId++, ...update });
      waiters.splice(0).forEach((w) => w());
    },
    /** Shart bajarilguncha kutadi (bot javobi fonda keladi) */
    async until(check, label = 'shart', timeoutMs = 8000) {
      const started = Date.now();
      while (Date.now() - started < timeoutMs) {
        const found = check(calls);
        if (found) return found;
        await new Promise((r) => setTimeout(r, 25));
      }
      throw new Error(`kutilgan narsa kelmadi: ${label}`);
    },
    sentTo(chatId) {
      return calls.filter((c) => /^send/.test(c.method) && String(c.chat_id) === String(chatId));
    },
    async stop() {
      waiters.splice(0).forEach((w) => w());
      server.closeAllConnections?.();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

module.exports = { startFakeTelegram };
