if (process.env.NODE_ENV !== "production") {
  require("dotenv").config();
}

const { Client, GatewayIntentBits } = require("discord.js");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const owner = process.env.GITHUB_OWNER;
const repo = process.env.GITHUB_REPO;
const branch = process.env.GITHUB_BRANCH || "main";
const filePath = "matches.json";

client.once("ready", () => {
  console.log(`BLC Scrim Bot is online as ${client.user.tag}`);
});

function cleanText(text) {
  return String(text || "").replace(/\*/g, "").trim();
}

function getField(content, label) {
  const regex = new RegExp(`${label}:\\s*(.*)`, "im");
  const match = content.match(regex);
  return match ? cleanText(match[1]) : "Not listed";
}

function formatDisplayDate(dateString) {
  const date = new Date(dateString);

  if (isNaN(date.getTime())) return dateString;

  return date.toLocaleString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

async function getGitHubMatchesFile() {
  const url =
    `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}?ref=${branch}`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json"
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`GitHub read failed: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  const fileContent = Buffer.from(data.content, "base64").toString("utf8");

  return {
    sha: data.sha,
    matches: fileContent.trim() ? JSON.parse(fileContent) : []
  };
}

async function updateGitHubMatchesFile(matches) {
  const latestFile = await getGitHubMatchesFile();

  const url =
    `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`;

  const updatedContent = Buffer.from(
    JSON.stringify(matches, null, 2)
  ).toString("base64");

  const response = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      message: "Update approved scrim match",
      content: updatedContent,
      sha: latestFile.sha,
      branch: branch
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`GitHub update failed: ${response.status} ${errorText}`);
  }
}

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  if (message.author.id !== process.env.APPROVER_ID) return;

  const reply = message.content.toLowerCase().trim();

  if (reply === "yes") {
    try {
      const messages = await message.channel.messages.fetch({
        limit: 5,
        before: message.id
      });

      const scrimRequest = messages.find(msg =>
        msg.content.includes("New Scrim Request")
      );

      if (!scrimRequest) {
        await message.reply("❌ Could not find a scrim request above this message.");
        return;
      }

      const teamName = getField(scrimRequest.content, "Team Name");
      const teamSlot = getField(scrimRequest.content, "BLC Team");
      const preferredDate = getField(scrimRequest.content, "Preferred Date");

      if (
        teamName === "Not listed" ||
        teamSlot === "Not listed" ||
        preferredDate === "Not listed"
      ) {
        await message.reply("❌ Missing Team Name, BLC Team, or Preferred Date.");
        return;
      }

      const githubFile = await getGitHubMatchesFile();
      const matches = githubFile.matches;

      matches.push({
        teamSlot: teamSlot,
        team: teamName,
        date: formatDisplayDate(preferredDate),
        startTime: preferredDate,
        mode: "Competitive",
        status: "Approved"
      });

      await updateGitHubMatchesFile(matches);

      await message.reply(
        `✅ Scrim approved for ${teamName} (${teamSlot}) and added to the matches page.`
      );
    } catch (error) {
      console.error("FULL ERROR:", error);

      await message.reply(
        "❌ GitHub update failed:\n```" + error.message + "```"
      );
    }
  }

  if (reply === "no") {
    await message.reply("❌ Scrim denied.");
  }
});

client.login(process.env.DISCORD_TOKEN);