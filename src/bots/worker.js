// src/bots/worker.js
// Telegram bot runner wiring.

import 'dotenv/config';
import { Telegraf } from 'telegraf';
import { pool } from '../db/pool.js';
import {
  handleChatMigration,
  handleClaimCommand,
  handleMyChatMember,
  handleNewChatMembers,
} from './telegram/handlers.js';

const token = process.env.TELEGRAM_BOT_TOKEN;

if (!token || !token.trim()) {
  console.error('Error: TELEGRAM_BOT_TOKEN environment variable is missing.');
  process.exit(1);
}

const bot = new Telegraf(token);

bot.on('my_chat_member', async (ctx) => {
  try {
    await handleMyChatMember(ctx, { db: pool });
  } catch (err) {
    console.error('Error handling my_chat_member:', err.message);
  }
});

bot.command('oninna_claim', async (ctx) => {
  try {
    await handleClaimCommand(ctx, { db: pool, botInfo: bot.botInfo });
  } catch (err) {
    console.error('Error handling claim command:', err.message);
  }
});

bot.on('message', async (ctx, next) => {
  try {
    if (ctx.message?.migrate_to_chat_id) {
      await handleChatMigration(ctx, { db: pool });
    } else if (ctx.message?.new_chat_members) {
      await handleNewChatMembers(ctx, { db: pool, botInfo: bot.botInfo });
    } else {
      await next();
    }
  } catch (err) {
    console.error('Error handling message update:', err.message);
  }
});

bot.catch((err) => {
  console.error('Unhandled bot error:', err.message);
});

async function main() {
  await bot.launch({
    allowedUpdates: ['message', 'my_chat_member'],
  });
  console.log('ONINNA Telegram bot worker started.');
}

const stopSignals = ['SIGINT', 'SIGTERM'];
for (const signal of stopSignals) {
  process.once(signal, () => {
    console.log(`Received ${signal}, stopping bot...`);
    bot.stop(signal);
    pool.end().catch(() => {});
  });
}

main().catch((err) => {
  console.error('Failed to launch bot:', err.message);
  process.exit(1);
});
