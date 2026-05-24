require("dotenv").config();

const fs = require("fs");
const path = require("path");
const { Client, GatewayIntentBits } = require("discord.js");

const matchesPath = path.join(__dirname, "..", "matches.json");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

client.once("clientReady", () => {
  console.log(`BLC Scrim Bot is online as ${client.user.tag}`);
});

function getField(content, label) {
  const regex = new RegExp("\\*\\*" + label + ":\\*\\*\\s*(.+)", "i");
  const match = content.match(regex);
  return match ? match[1].trim() : "Not listed";
}

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  const reply = message.content.toLowerCase().trim();

  if (message.author.id !== process.env.APPROVER_ID) return;

  if (reply === "yes") {
    const messages = await message.channel.messages.fetch({ limit: 10 });

    const scrimRequest = messages.find(msg =>
      msg.author.bot &&
      msg.content.includes("New Scrim Request")
    );

    if (!scrimRequest) {
      await message.reply("Could not find the scrim request above this message.");
      return;
    }

    const teamName = getField(scrimRequest.content, "Team Name");
    const preferredDate = getField(scrimRequest.content, "Preferred Date");

    const matches = JSON.parse(fs.readFileSync(matchesPath, "utf8"));

    matches.push({
  team: teamName,
  date: preferredDate,
  startTime: preferredDate + ":00",
  mode: "Competitive",
  status: "Approved"
});

    fs.writeFileSync(matchesPath, JSON.stringify(matches, null, 2));

    await message.reply("✅ Scrim approved and added to matches.json.");
  }

  if (reply === "no") {
    await message.reply("❌ Scrim denied.");
  }
});

client.login(process.env.DISCORD_TOKEN);