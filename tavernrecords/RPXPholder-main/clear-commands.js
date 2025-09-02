/**
 * TavernRecords XP Bot
 * Copyright (c) 2025 Ravenwingz
 *
 * Originally based on code by JTexpo
 * Updated and maintained by Ravenwingz
 *
 * Licensed under the MIT License with Attribution Notice.
 * See the LICENSE and NOTICE files in the project root for details.
 */

// scripts/clear-commands.js
require('dotenv').config();
const { REST, Routes } = require('discord.js');

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;

if (!TOKEN || !CLIENT_ID) {
  console.error('❌ Missing DISCORD_TOKEN or CLIENT_ID in .env');
  process.exit(1);
}

// Env toggles:
// CLEAR_GLOBAL=true               -> wipe ALL global commands
// CLEAR_GUILD_IDS=ID1,ID2,ID3     -> wipe per-guild commands for these guilds
const CLEAR_GLOBAL  = String(process.env.CLEAR_GLOBAL || '').toLowerCase() === 'true';
const CLEAR_GUILD_IDS = (process.env.CLEAR_GUILD_IDS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

(async () => {
  try {
    const rest = new REST({ version: '10' }).setToken(TOKEN);

    if (!CLEAR_GLOBAL && CLEAR_GUILD_IDS.length === 0) {
      console.log('⚠️ Nothing to clear. Set CLEAR_GLOBAL=true or CLEAR_GUILD_IDS in .env');
      return;
    }

    if (CLEAR_GLOBAL) {
      console.log('🧹 Clearing ALL GLOBAL commands…');
      await rest.put(Routes.applicationCommands(CLIENT_ID), { body: [] });
      console.log('✅ Global commands cleared.');
    }

    for (const gid of CLEAR_GUILD_IDS) {
      console.log(`🧹 Clearing commands for guild ${gid}…`);
      await rest.put(Routes.applicationGuildCommands(CLIENT_ID, gid), { body: [] });
      console.log(`✅ Guild ${gid} commands cleared.`);
    }

    console.log('🎉 Done.');
  } catch (e) {
    console.error('❌ Clear failed:', e);
    process.exit(1);
  }
})();
