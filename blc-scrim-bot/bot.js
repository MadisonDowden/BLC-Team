require("dotenv").config();

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

function getField(content, label) {
  const regex = new RegExp("\\*\\*" + label + ":\\*\\*\\s*(.+)", "i");
  const match = content.match(regex);
  return match ? match[1].trim() : "Not listed";
}

function formatDisplayDate(dateString) {
  const date = new Date(dateString);

  if (isNaN(date.getTime())) {
    return dateString;
  }

  return date.toLocaleString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short"
  });
}

async function getGitHubMatchesFile() {
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}?ref=${branch}`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json"
    }
  });

  if (!response.ok) {
    throw new Error(`GitHub read failed: ${response.status}`);
  }

  const data = await response.json();
  const content = Buffer.from(data.content, "base64").toString("utf8");

  return {
    sha: data.sha,
    matches: JSON.parse(content)
  };
}

async function updateGitHubMatchesFile(matches, sha) {
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`;

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
      sha: sha,
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

    try {
      const githubFile = await getGitHubMatchesFile();
      const matches = githubFile.matches;

      matches.push({
        team: teamName,
        date: formatDisplayDate(preferredDate),
        startTime: preferredDate,
        mode: "Competitive",
        status: "Approved"
      });

      await updateGitHubMatchesFile(matches, githubFile.sha);

      await message.reply("✅ Scrim approved and pushed to the live website matches.json.");
    } catch (error) {
      console.error(error);
      await message.reply("❌ Scrim approved, but I could not update GitHub matches.json.");
    }
  }

  if (reply === "no") {
    await message.reply("❌ Scrim denied.");
  }
});

const token = process.env.DISCORD_TOKEN;

console.log("TOKEN EXISTS:", !!token);
console.log("TOKEN LENGTH:", token ? token.length : 0);
console.log("TOKEN START:", token ? token.slice(0, 6) : "none");
console.log("TOKEN END:", token ? token.slice(-6) : "none");

client.login(token);