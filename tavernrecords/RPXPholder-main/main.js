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

const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');
const { Client, Collection, GatewayIntentBits, Partials } = require('discord.js');
const { MessageFlags } = require('discord-api-types/v10');

const { guildService } = require('./xpholder/services/guild');
const { SequelizeDatabaseService } = require('./xpholder/database/sequelize')

const {
  getActiveCharacterIndex,
  getRoleMultiplier,
  logCommand,
  logError,
  logSuccess,
  safeChannelSend,
  getLevelInfo,
  updateMemberTierRoles,
  getXp,
  buildCharacterEmbed
} = require('./xpholder/utils');

const { DONATE_URL } = require('./xpholder/config.json');

dotenv.config();

if (!process.env.DISCORD_TOKEN) {
  console.error('❌ Missing DISCORD_TOKEN in .env');
  process.exit(1);
}

// Ensure ./guilds exists
const guildsDir = path.join(__dirname, 'guilds');
if (!fs.existsSync(guildsDir)) {
  fs.mkdirSync(guildsDir, { recursive: true });
}

// Per-guild service cache
const gServices = new Map(); // guildId -> { gService, ts }
const GSERVICE_TTL_MS = 5 * 60_000;

async function getGService(guildId) {
  const cached = gServices.get(guildId);
  if (cached && (Date.now() - cached.ts) < GSERVICE_TTL_MS) {
    return cached.gService;
  }
  const dbPath = path.join(__dirname, 'guilds', `${guildId}.db`);
  const sequelizeDb = new SequelizeDatabaseService(dbPath)
  const svc = new guildService(sequelizeDb, guildId)

  // Ensure schema exists even for unregistered guilds
  try { await svc.createDatabases(); } catch (e) { console.warn(`[db] createDatabases(${guildId}) failed:`, e?.message); }

  await svc.init();
  try { await svc.optimizeDatabase?.(); } catch (_) {}

  gServices.set(guildId, { gService: svc, ts: Date.now() });
  return svc;
}

/**
 * On startup, try to fetch critical roles/channels so config problems show up early in logs.
 */
async function validateGuildResourcesOnReady(client, getGServiceFn) {
  for (const [guildId, guild] of client.guilds.cache) {
    try {
      const gService = await getGServiceFn(guildId);
      if (!await gService.isRegistered()) {
        console.log(`[health] ${guild.name} (${guildId}) not registered; skipping ready-check.`);
        continue;
      }

      const ids = [
        gService.config?.moderationRoleId,
        gService.config?.xpFreezeRoleId,
        gService.config?.xpShareRoleId,
        gService.config?.tier1RoleId,
        gService.config?.tier2RoleId,
        gService.config?.tier3RoleId,
        gService.config?.tier4RoleId,
        gService.config?.levelUpChannelId,
      ].filter(Boolean);

      for (const id of ids) {
        await guild.roles.fetch(id).catch(async () => {
          await guild.channels.fetch(id).catch(() => {});
        });
      }

      console.log(`[health] Ready-check complete for guild ${guild.name} (${guildId}).`);
    } catch (e) {
      console.warn(`[health] Ready-check failed for guild ${guildId}:`, e?.message);
    }
  }
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildMembers
  ],
  partials: [Partials.Channel]
});

client.commands = new Collection();

// Load commands
const commandFolders = ['everyone', 'mod', 'owner'];
for (const folder of commandFolders) {
  const commandFiles = fs.readdirSync(path.join(__dirname, 'xpholder', 'commands', folder))
    .filter(file => file.endsWith('.js'));
  for (const file of commandFiles) {
    const command = require(path.join(__dirname, 'xpholder', 'commands', folder, file));
    if (command?.data?.name) {
      client.commands.set(command.data.name, command);
    }
  }
}

client.once('ready', async () => {
  console.log("✅ Bot is ready.");
  console.log("📜 Commands:", client.commands.map(cmd => cmd.data.name));

  // No per-guild publishing here — use your deploy script for global or per-guild registration.

  // Early sanity check
  await validateGuildResourcesOnReady(client, getGService);

  // Auto health DM to owner on startup (only if enabled + has problems)
  // for (const [guildId, guild] of client.guilds.cache) {
  //   try {
  //     const gService = await getGService(guildId);
  //     if (!await gService.isRegistered()) continue;
  //     if (gService.config?.healthAutoDM !== 'on') continue;

  //     const owner = await guild.fetchOwner();
  //     const { embed, hasProblems } = await runHealthCheck(gService, guild);
  //     if (hasProblems) {
  //       await owner.send({ embeds: [embed] }).catch(() => {});
  //     }
  //   } catch (e) {
  //     console.warn(`[health autoDM] guild ${guildId} failed:`, e?.message);
  //   }
  // }
});

// Optional: clean service cache when leaving a guild
client.on('guildDelete', (guild) => {
  gServices.delete(guild.id);
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand() || !interaction.inGuild()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  // Defer ASAP to avoid "Unknown interaction" & "InteractionNotReplied"
  const isPublic = interaction.options?.getBoolean?.("public") ?? false;
  if (!interaction.deferred && !interaction.replied) {
    try {
      await interaction.deferReply({ flags: isPublic ? undefined : MessageFlags.Ephemeral });
    } catch (_) {}
  }

  const guildId = interaction.guildId;
  const gService = await getGService(guildId);

  if (!await gService.isRegistered() && command.data.name !== "register") {
    try {
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({
          content: `Sorry, but your server is not registered. Please contact ${gService.mentionOwner(interaction)} and ask them to run \`/register\`.`,
        });
      } else {
        await interaction.reply({
          content: `Sorry, but your server is not registered. Please contact ${gService.mentionOwner(interaction)} and ask them to run \`/register\`.`,
          ephemeral: true
        });
      }
    } catch (_) {}
    return;
  }

  try { logCommand(interaction); } catch (error) { console.log(error); }

  try {
    await command.execute(gService, interaction);
  } catch (error) {
    try { await logError(interaction, error); } catch (_) {}
    console.error(error);
    try {
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply("Something went wrong running that command.");
      } else {
        await interaction.reply({ content: "Something went wrong running that command.", ephemeral: true });
      }
    } catch (_) {}
  }
});

client.on('messageCreate', async message => {
  try {
    if (!message.inGuild() || message.author.bot) return;
    if ((message.content.split(/\s+/).length <= 10) && !message.content.startsWith('!')) return;

    const guild = message.guild;
    const player = message.member;
    const guildId = guild.id;

    const dbPath = path.join(__dirname, 'guilds', `${guildId}.db`);
    if (!fs.existsSync(dbPath)) return;

    const gService = await getGService(guildId);
    if (!await gService.isRegistered()) return;

    const roles = new Set(player._roles);
    if (roles.has(gService.config["xpFreezeRoleId"])) return;

    const messageCount = message.content.split(/\s+/).length;

    let channel = message.channel;
    while (channel && !gService.channels[channel.id]) {
      channel = channel.parent ?? null;
    }
    if (!channel || gService.channels[channel.id] === 0) return;

    const roleBonus = getRoleMultiplier(gService.config["roleBonus"], gService.roles, player._roles);
    const characterIndex = getActiveCharacterIndex(gService.config, player._roles);
    const character = await gService.getCharacter(`${player.id}-${characterIndex}`);
    if (!character) return;

    const xp = getXp(
      messageCount,
      roleBonus,
      gService.channels[channel.id],
      gService.config["xpPerPostDivisor"],
      gService.config["xpPerPostFormula"]
    );

    if (roles.has(gService.config["xpShareRoleId"])) {
      const playerCharacters = await gService.getAllCharacters(player.id);
      const share = playerCharacters.length ? (xp / playerCharacters.length) : 0;
      for (const subCharacter of playerCharacters) {
        await updateCharacterXpAndMessage(guild, gService, subCharacter, share, player);
      }
    } else {
      await updateCharacterXpAndMessage(guild, gService, character, xp, player);
    }
  } catch (error) {
    console.error(error);
  }
});

async function updateCharacterXpAndMessage(guild, gService, character, xp, player) {
  try {
    const oldLevelInfo = getLevelInfo(gService.levels, character.xp);
    await gService.updateCharacterXP(character, xp);

    const newTotalXp = character.xp + xp;
    const newLevelInfo = getLevelInfo(gService.levels, newTotalXp);

    const leveledUp = String(oldLevelInfo.level) !== String(newLevelInfo.level);

    await updateMemberTierRoles(guild, gService, player)

    let awardChannel = null;
    try { awardChannel = await guild.channels.fetch(gService.config["levelUpChannelId"]); } catch (_) {}

    if (leveledUp){
      const embed = await buildCharacterEmbed(gService, guild, player, { ...character, xp: newTotalXp})
      embed.setTitle(`${character.name} Leveled Up! 🎉`);
      embed.setFooter({ text: `Support the bot: ${DONATE_URL}`})

      if (awardChannel){
        await safeChannelSend(
          awardChannel,
          {
            content: `<@${player.id}>`,
            allowedMentions: { users: [player.id] },
            embeds: [embed]
          }
        )
      } else {
        try { await player.send({ embeds: [embed] }); } catch (_) {}
      }

      try {
        await logSuccess(
          { client: guild.client, guild, user: player.user, commandName: 'auto_level_up', options: { _hoistedOptions: [] } },
          `Level Up: ${character.name}`,
          [
            { name: "Player", value: `<@${player.id}>`, inline: true },
            { name: "Old → New", value: `${oldLevelInfo.level} → **${newLevelInfo.level}**`, inline: true },
            { name: "Gained", value: `${Math.floor(xp)} XP`, inline: true }
          ]
        );
      } catch (_) {}
    }
  } catch (error) {
    console.error(error);
  }
}

// Graceful shutdown
async function shutdown(signal) {
  try {
    console.log(`\n${signal} received — shutting down…`);
    gServices.clear();
    await client.destroy();
  } catch (e) {
    console.error("Error during shutdown:", e);
  } finally {
    process.exit(0);
  }
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

client.login(process.env.DISCORD_TOKEN);
