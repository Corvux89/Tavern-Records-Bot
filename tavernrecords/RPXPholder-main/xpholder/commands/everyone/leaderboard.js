const { SlashCommandBuilder } = require('@discordjs/builders');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const { getActiveCharacterIndex, getLevelInfo, getTierInfo, getTierVisuals } = require('../../utils');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('Show the XP leaderboard')
    .addStringOption(o =>
      o.setName('scope')
        .setDescription('Rank characters or players')
        .addChoices(
          { name: 'Characters', value: 'characters' },
          { name: 'Players', value: 'players' },
        )
        .setRequired(false)
    )
    .addIntegerOption(o =>
      o.setName('page_size')
        .setDescription('Entries per page (default 10)')
        .setMinValue(5)
        .setMaxValue(25)
        .setRequired(false)
    )
    .addBooleanOption(o =>
      o.setName('active_only')
        .setDescription('Only the active character per player (default: true)')
        .setRequired(false)
    )
    .addBooleanOption(o =>
      o.setName('public')
        .setDescription('Show this output to everyone?')
        .setRequired(false)
    ),

  async execute(guildService, interaction) {
    const guild = interaction.guild;

    const scope = interaction.options.getString('scope') || 'characters';
    const pageSize = interaction.options.getInteger('page_size') ?? 10;
    const activeOnlyInput = interaction.options.getBoolean('active_only');
    const onlyActive = activeOnlyInput === null ? true : activeOnlyInput;
    const isPublic = interaction.options.getBoolean('public') ?? false;

    // Pull all characters
    const allChars = await guildService.getAllGuildCharacters();
    if (!Array.isArray(allChars) || allChars.length === 0) {
      await interaction.editReply({ content: 'No characters found for this server yet.', ephemeral: !isPublic });
      return;
    }

    // Group by player
    const byPlayer = new Map();
    for (const c of allChars) {
      if (!byPlayer.has(c.player_id)) byPlayer.set(c.player_id, []);
      byPlayer.get(c.player_id).push(c);
    }

    const getMember = async (id) => {
      try { return await guild.members.fetch(id); } catch { return null; }
    };

    // Build the ranked list once; we’ll paginate the array
    let items = [];
    if (scope === 'characters') {
      if (onlyActive) {
        for (const [playerId, chars] of byPlayer) {
          const member = await getMember(playerId);
          if (!member) {
            if (chars[0]) items.push(chars[0]);
            continue;
          }
          const idx = getActiveCharacterIndex(guildService.config, member._roles);
          const active = chars.find(c => Number(c.character_index) === Number(idx)) || chars[0];
          if (active) items.push(active);
        }
      } else {
        items = [...allChars];
      }
      items.sort((a, b) => (b.xp ?? 0) - (a.xp ?? 0));
    } else {
      // players scope
      for (const [playerId, chars] of byPlayer) {
        if (!chars.length) continue;
        let chosen = null;
        if (onlyActive) {
          const member = await getMember(playerId);
          if (member) {
            const idx = getActiveCharacterIndex(guildService.config, member._roles);
            chosen = chars.find(c => Number(c.character_index) === Number(idx)) || chars[0];
          } else {
            chosen = chars[0];
          }
        } else {
          chosen = [...chars].sort((a, b) => (b.xp ?? 0) - (a.xp ?? 0))[0];
        }
        items.push({
          player_id: playerId,
          rep: chosen,
          xp: Number(chosen.xp) || 0,
          name: chosen.name
        });
      }
      items.sort((a, b) => (b.xp ?? 0) - (a.xp ?? 0));
    }

    // Helpers
    const medal = (rank) => rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`;

    async function pageEmbed(pageIdx) {
      const start = pageIdx * pageSize;
      const slice = items.slice(start, start + pageSize);
      let topThumb = null;

      const lines = [];
      for (let i = 0; i < slice.length; i++) {
        const rank = start + i + 1;

        if (scope === 'characters') {
          const c = slice[i];
          const xp = Number(c.xp) || 0;
          const li = getLevelInfo(guildService.levels, xp);
          const ti = getTierInfo(guildService.tiers, li.level)
          const { emoji } = await getTierVisuals(guild, guildService.config[`tier${ti.tier}RoleId`]);

          if (!topThumb && c.picture_url && c.picture_url !== 'null') {
            topThumb = c.picture_url;
          }

          lines.push(`${medal(rank)} ${emoji ?? ''} **${c.name}** — Lvl ${li.level} · ${Math.floor(xp)} XP`);
        } else {
          const p = slice[i];
          const xp = Number(p.xp) || 0;
          const li = getLevelInfo(guildService.levels, xp);
          const ti = getTierInfo(guildService.tiers, li.level)
          const { emoji } = await getTierVisuals(guild, guildService.config[`tier${ti.tier}RoleId`]);

          if (!topThumb && p.rep?.picture_url && p.rep.picture_url !== 'null') {
            topThumb = p.rep.picture_url;
          }

          lines.push(`${medal(rank)} ${emoji ?? ''} <@${p.player_id}> — **${p.name}** (Lvl ${li.level}) · ${Math.floor(xp)} XP`);
        }
      }

      // “You” line if off-page
      let youLine = null;
      if (scope === 'characters') {
        const inv = await getMember(interaction.user.id);
        if (inv) {
          const idx = getActiveCharacterIndex(guildService.config, inv._roles);
          let full = [];
          if (onlyActive) {
            for (const [playerId, chars] of byPlayer) {
              const member = await getMember(playerId);
              const aidx = member ? getActiveCharacterIndex(guildService.config, member._roles) : null;
              const active = aidx ? chars.find(c => Number(c.character_index) === Number(aidx)) || chars[0] : chars[0];
              if (active) full.push(active);
            }
          } else {
            full = [...allChars];
          }
          full.sort((a, b) => (b.xp ?? 0) - (a.xp ?? 0));

          const yourChar = full.find(c => c.player_id === interaction.user.id && Number(c.character_index) === Number(idx));
          const yourRank = yourChar ? (full.indexOf(yourChar) + 1) : null;

          if (yourRank && (yourRank <= 0 || yourRank > items.length || (yourRank <= start || yourRank > start + slice.length))) {
            const xp = Number(yourChar?.xp) || 0;
            const li = getLevelInfo(guildService.levels, xp);
            const ti = getTierInfo(guildService.tiers, li.level)
            const { emoji } = await getTierVisuals(guild, guildService.config[`tier${ti.tier}RoleId`]);
            youLine = `**You:** #${yourRank} ${emoji ?? ''} **${yourChar?.name ?? 'Character'}** — Lvl ${li.level} · ${Math.floor(xp)} XP`;
          }
        }
      } else {
        const full = [];
        for (const [playerId, chars] of byPlayer) {
          if (!chars.length) continue;
          let chosen = null;
          if (onlyActive) {
            const member = await getMember(playerId);
            if (member) {
              const idx = getActiveCharacterIndex(guildService.config, member._roles);
              chosen = chars.find(c => Number(c.character_index) === Number(idx)) || chars[0];
            } else {
              chosen = chars[0];
            }
          } else {
            chosen = [...chars].sort((a, b) => (b.xp ?? 0) - (a.xp ?? 0))[0];
          }
          full.push({ player_id: playerId, rep: chosen, xp: Number(chosen.xp) || 0, name: chosen.name });
        }
        full.sort((a, b) => (b.xp ?? 0) - (a.xp ?? 0));
        const yourRow = full.find(r => r.player_id === interaction.user.id);
        const yourRank = yourRow ? (full.indexOf(yourRow) + 1) : null;

        if (yourRank && (yourRank <= 0 || yourRank > items.length || (yourRank <= start || yourRank > start + slice.length))) {
          const xp = Number(yourRow?.xp) || 0;
          const li = getLevelInfo(guildService.levels, xp);
          const ti = getTierInfo(guildService.tiers, li.level)
          const { emoji } = await getTierVisuals(guild, guildService.config[`tier${ti.tier}RoleId`]);
          youLine = `**You:** #${yourRank} ${emoji ?? ''} <@${yourRow.player_id}> — **${yourRow.name}** (Lvl ${li.level}) · ${Math.floor(xp)} XP`;
        }
      }

      const title = scope === 'characters'
        ? `Leaderboard — Characters ${onlyActive ? '(Active Only)' : ''}`
        : `Leaderboard — Players ${onlyActive ? '(Active Char)' : '(Best Char)'}`;

      const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
      const embed = new EmbedBuilder()
        .setTitle(`${title} • Page ${pageIdx + 1}/${totalPages}`)
        .setDescription(lines.length ? lines.join('\n') : '_No entries to show_')
        .setColor(0x57F287)
        .setTimestamp();

      if (topThumb) embed.setThumbnail(topThumb);
      if (youLine) embed.addFields({ name: '\u200B', value: youLine });

      return embed;
    }

    // Controls
    const controls = () => new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('lb_prev').setLabel('Prev').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('lb_next').setLabel('Next').setStyle(ButtonStyle.Secondary)
    );

    let page = 0;
    const msg = await interaction.editReply({
      ephemeral: !isPublic,
      embeds: [await pageEmbed(page)],
      components: [controls()]
    });

    // Collector for pagination (invoker-only)
    const filter = (i) =>
      ['lb_prev', 'lb_next'].includes(i.customId) &&
      i.message.id === msg.id &&
      i.user.id === interaction.user.id;

    const collector = (interaction.channel || msg.channel).createMessageComponentCollector({
      filter,
      time: 15 * 60 * 1000
    });

    collector.on('collect', async (btn) => {
      try {
        if (btn.customId === 'lb_prev') page = Math.max(0, page - 1);
        if (btn.customId === 'lb_next') page = Math.min(Math.ceil(items.length / pageSize) - 1, page + 1);
        await btn.update({ embeds: [await pageEmbed(page)], components: [controls()] });
      } catch (e) {
        // no-op
      }
    });

    collector.on('end', async () => {
      try { await msg.edit({ components: [] }); } catch {}
    });
  }
};
