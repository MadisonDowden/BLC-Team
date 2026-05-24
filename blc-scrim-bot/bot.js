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

client.once("clientReady", () => {
  console.log(`BLC Scrim Bot is online as ${client.user.tag}`);
});

function getField(content, label) {
  const regex = new RegExp("\\*\\*" + label + ":\\*\\*\\s*(.+)", "i");
  const match = content.match(regex);
  return match ? match[1].trim() : "Not listed";
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
    throw new Error(`GitHub read failed: ${response.status}`);
  }

  const data = await response.json();

  return {
    sha: data.sha,
    matches: JSON.parse(
      Buffer.from(data.content, "base64").toString("utf8")
    )
  };
}

async function updateGitHubMatchesFile(matches, sha) {
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
      sha,
      branch
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `GitHub update failed: ${response.status} ${errorText}`
    );
  }
}

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  if (message.author.id !== process.env.APPROVER_ID) return;

  const reply = message.content.toLowerCase().trim();

  if (reply === "yes") {
    try {
      const messages = await message.channel.messages.fetch({ limit: 25 });

      const scrimRequests = messages
        .filter(
          msg =>
            msg.author.bot &&
            msg.content.includes("New Scrim Request")
        )
        .sort(
          (a, b) => b.createdTimestamp - a.createdTimestamp
        );

      const scrimRequest = scrimRequests.first();

      if (!scrimRequest) {
        await message.reply(
          "Could not find a recent scrim request."
        );
        return;
      }

      const teamName = getField(
        scrimRequest.content,
        "Team Name"
      );

      const preferredDate = getField(
        scrimRequest.content,
        "Preferred Date"
      );

      const githubFile = await getGitHubMatchesFile();
      const matches = githubFile.matches;

      matches.push({
        team: teamName,
        date: formatDisplayDate(preferredDate),
        startTime: preferredDate,
        mode: "Competitive",
        status: "Approved"
      });

      await updateGitHubMatchesFile(
        matches,
        githubFile.sha
      );

      await message.reply(
        `✅ Scrim approved for ${teamName} and pushed live to matches page.`
      );

    } catch (error) {
      console.error(error);

      await message.reply(
        "❌ Scrim approved but failed to update matches.json."
      );
    }
  }

  if (reply === "no") {
    await message.reply("❌ Scrim denied.");
  }
});

client.login(process.env.DISCORD_TOKEN);