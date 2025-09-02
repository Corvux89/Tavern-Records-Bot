// xpholder/commands/everyone/help.js
const { SlashCommandBuilder } = require('@discordjs/builders');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { MessageFlags } = require('discord-api-types/v10');

const {
  XPHOLDER_COLOUR,
  XPHOLDER_ICON_URL,     // fallback icon
  DEV_SERVER_URL,
  DONATE_URL
} = require("../../config.json");

// Tavern Records brand image for help pages (matches /approve)
const TAVERN_RECORDS_ICON =
  "https://cdn.discordapp.com/attachments/1403510335104618568/1404208777569243176/Tavern_Records.png?ex=68a2ec95&is=68a19b15&hm=2ed3d77dd3e7265eac5206400dca6af32a13ef758019086b3c2a913b2e9b8026&";

module.exports = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Tavern Records • Help & Quickstart')
    .addStringOption(option => option
      .setName("help_topic")
      .setDescription("Pick a help topic")
      .addChoices(
        { name: "Getting Started",      value: "getting_started" },
        { name: "Approvals & Levels",   value: "approvals" },
        { name: "XP Per Post",          value: "xp_per_post" },
        { name: "Import / Export",      value: "import_export" },
        { name: "Troubleshooting",      value: "troubleshooting" },
      )
      .setRequired(false))
    .addBooleanOption(option => option
      .setName("public")
      .setDescription("Show this help to everyone?")
      .setRequired(false)
    ),

  async execute(guildService, interaction) {
    // Defer to avoid Unknown interaction
    const isPublic = interaction.options.getBoolean("public") ?? false;
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply({ flags: isPublic ? undefined : MessageFlags.Ephemeral }).catch(() => {});
    }

    // Build all pages
    const pages = [
      buildGettingStartedEmbed(),
      buildApprovalsEmbed(),
      buildXpPerPostEmbed(),
      buildImportExportEmbed(),
      buildTroubleshootingEmbed(),
    ];

    // Initial page
    const topic = interaction.options.getString("help_topic");
    let index = 0;
    switch (topic) {
      case "approvals":      index = 1; break;
      case "xp_per_post":    index = 2; break;
      case "import_export":  index = 3; break;
      case "troubleshooting":index = 4; break;
      default:               index = 0; break;
    }

    const controls = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('help_prev').setLabel('◀').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('help_next').setLabel('▶').setStyle(ButtonStyle.Secondary)
    );

    const msg = await interaction.editReply({
      embeds: [pages[index]],
      components: [controls]
    }).then(() => interaction.fetchReply());

    // Collector (only command invoker can flip pages)
    const filter = i =>
      ['help_prev', 'help_next'].includes(i.customId) &&
      i.message.id === msg.id &&
      i.user.id === interaction.user.id;

    const collector = msg.createMessageComponentCollector({ filter, time: 10 * 60 * 1000 });

    collector.on('collect', async i => {
      try {
        if (i.customId === 'help_prev') index = (index - 1 + pages.length) % pages.length;
        if (i.customId === 'help_next') index = (index + 1) % pages.length;
        await i.update({ embeds: [pages[index]], components: [controls] });
      } catch (_) {}
    });

    collector.on('end', async () => {
      try { await msg.edit({ components: [] }); } catch (_) {}
    });
  },
};

/* ---------- Pages ---------- */

function baseEmbed(title) {
  return new EmbedBuilder()
    .setTitle(title)
    .setColor(XPHOLDER_COLOUR)
    .setThumbnail(TAVERN_RECORDS_ICON || XPHOLDER_ICON_URL)
    .setURL(DONATE_URL)
    .setFooter({ text: "Tavern Records • Click title to support on Ko‑fi ❤️" });
}

function buildGettingStartedEmbed() {
  return baseEmbed("Getting Started")
    .setDescription(
`Welcome to **Tavern Records**! 🍻  
Track characters, XP, and tiers across multiple servers.

[**💖 Support on Ko‑fi**](${DONATE_URL}) • [**🔧 Dev Server**](${DEV_SERVER_URL})`
    )
    .addFields(
      {
        name: "1) Register the Server (Owner)",
        value: "Run **/register**. It scans existing roles, creates any missing Tier/Character/XP roles, and sets defaults (approve level = 1, etc.).",
        inline: false
      },
      {
        name: "2) Configure XP",
        value: "Use **/edit_channels** to set `xp_per_post` per channel. Tune formulas with **/edit_config**.",
        inline: false
      },
      {
        name: "3) Approve Characters (Mods)",
        value: "Run **/approve_player**. Optionally set a one‑off `start_level`. The default is set via **/set_approve_level** or **/register**.",
        inline: false
      },
      {
        name: "4) Players Use /xp",
        value: "Players can view characters with **/xp**, switch actives (Set), toggle Freeze/Share/Ping, and Retire safely.",
        inline: false
      }
    );
}

function buildApprovalsEmbed() {
  return baseEmbed("Approvals & Levels")
    .addFields(
      {
        name: "Default Start Level",
        value: "Owner sets the default approve level with **/set_approve_level** (or during **/register**). This applies to future approvals.",
        inline: false
      },
      {
        name: "Per‑Approval Override",
        value: "Mods can pass an optional **start_level** when using **/approve_player** to override the default (1–20).",
        inline: false
      },
      {
        name: "What XP Does a Level Start At?",
        value: "We sum the `xp_to_next` values from level 1 up to (but not including) the chosen level. (Level 1 = 0 XP.)",
        inline: false
      }
    );
}

function buildXpPerPostEmbed() {
  return baseEmbed("XP Per Post")
    .addFields(
      {
        name: "Channel Setup",
        value: "Use **/edit_channels** to assign `xp_per_post` for RP channels (threads supported). 0 disables XP.",
        inline: false
      },
      {
        name: "Formulas & Divisor",
        value: "Adjust **`xp_per_post_formula`** and **`xp_per_post_divisor`** in **/edit_config**. You can also set role XP multipliers in **/edit_roles**.",
        inline: false
      },
      {
        name: "Freeze & Share",
        value: "Players can toggle **Freeze** (no XP) and **Share** (splits XP across all their PCs) from **/xp**.",
        inline: false
      }
    );
}

function buildImportExportEmbed() {
  return baseEmbed("Import / Export (Migration)")
    .setDescription("Moving from the old bot to the new one? Use these commands.")
    .addFields(
      {
        name: "Export",
        value: "On the **old bot**, run **/export** to download CSV files (characters, channels, roles, config, levels).",
        inline: false
      },
      {
        name: "Import",
        value: "On the **new bot**, run **/import** and upload those CSVs. The importer maps legacy columns and fills defaults.",
        inline: false
      },
      {
        name: "Tips",
        value: "Run **/register** first (to create roles), then **/import**. After import, run **/health** to verify everything’s wired up.",
        inline: false
      }
    );
}

function buildTroubleshootingEmbed() {
  return baseEmbed("Troubleshooting")
    .addFields(
      {
        name: "Commands don’t show?",
        value: "If you deployed globally, Discord may cache for a bit. You can also use a per‑guild deploy during testing.",
        inline: false
      },
      {
        name: "Missing Permissions",
        value: "If role changes fail: grant the bot **Manage Roles** and move the bot’s top role **above** Character/Tier/XP roles.",
        inline: false
      },
      {
        name: "No XP?",
        value: "Check channel XP settings (**/view_game_rules**), ensure they have an approved character, and that Freeze is off.",
        inline: false
      },
      {
        name: "Health Check",
        value: "Run **/health** (Owner/Mod) to scan for missing IDs/roles or misconfigurations.",
        inline: false
      }
    );
}
