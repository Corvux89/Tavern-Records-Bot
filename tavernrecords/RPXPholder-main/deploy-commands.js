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

// scripts/deploy-commands.js
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { REST } = require('@discordjs/rest')
const { Routes } = require('discord-api-types/v10')

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;

if (!TOKEN || !CLIENT_ID) {
  console.error('❌ Missing DISCORD_TOKEN or CLIENT_ID in .env');
  process.exit(1);
}

function loadCommands() {
  // IMPORTANT: this expects you run from project root
  const baseDir = path.join(process.cwd(), 'xpholder', 'commands');
  const folders = ['everyone', 'mod', 'owner'];
  const commands = [];

  for (const folder of folders) {
    const dir = path.join(baseDir, folder);
    if (!fs.existsSync(dir)) {
      console.warn(`⚠️ Skipping missing folder: ${dir}`);
      continue;
    }
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.js'));
    for (const file of files) {
      const full = path.join(dir, file);
      try {
        const cmd = require(full);
        if (cmd?.data?.toJSON) {
          commands.push(cmd.data.toJSON());
          console.log(`✅ Loaded: ${cmd.data.name} (${folder}/${file})`);
        } else {
          console.warn(`⚠️ Skipped (no data.toJSON): ${folder}/${file}`);
        }
      } catch (e) {
        console.error(`❌ Failed to load ${folder}/${file}:`, e.message);
      }
    }
  }
  return commands;
}

async function deploy() {
  const commands = loadCommands();
  console.log(`🌍 Registering ${commands.length} commands globally...`);
  const rest = new REST({ version: '10' }).setToken(TOKEN);
  await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
  console.log('✅ Global commands deployed.');
}

deploy().catch(e => {
  console.error('❌ Deploy failed:', e);
  process.exit(1);
});
