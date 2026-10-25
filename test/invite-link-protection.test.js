import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import test from "node:test";

const port = 3011;
const baseUrl = process.env.TEST_BASE_URL || `http://127.0.0.1:${port}`;
const seededLinks = [
  "https://discord.gg/example-pixel-pioneers",
  "https://t.me/example-mobile-match-night",
  "https://chat.whatsapp.com/example-lagos-console-crew",
  "https://t.me/example-career-builders-network",
  "https://discord.gg/example-remote-work-circle",
  "https://chat.whatsapp.com/example-young-professionals-connect",
  "https://discord.gg/example-javascript-study-lab",
  "https://t.me/example-cloud-builders-africa",
  "https://chat.whatsapp.com/example-no-code-makers",
  "https://chat.whatsapp.com/example-coffee-conversation",
  "https://t.me/example-bookish-singles-club",
  "https://discord.gg/example-new-friends-weekend",
  "https://discord.gg/example-study-sprint-collective",
  "https://t.me/example-scholarship-alert-desk",
  "https://chat.whatsapp.com/example-exam-prep-partners",
];

async function waitForServer() {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
    } catch {
      // The child process is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Test server did not start");
}

test("public community responses never expose invite links", async (t) => {
  if (!process.env.TEST_BASE_URL) {
    const server = spawn(process.execPath, ["server.js"], {
      env: { ...process.env, PORT: String(port), HOST: "127.0.0.1" },
      stdio: "ignore",
    });
    t.after(() => server.kill());
  }

  await waitForServer();
  const listResponse = await fetch(`${baseUrl}/api/communities`);
  const listBody = await listResponse.text();
  assert.equal(listResponse.status, 200);

  const firstCommunity = JSON.parse(listBody).items[0];
  const detailResponse = await fetch(`${baseUrl}/api/communities/${firstCommunity.id}`);
  const detailBody = await detailResponse.text();
  assert.equal(detailResponse.status, 200);

  for (const body of [listBody, detailBody]) {
    assert.doesNotMatch(body, /invite_link/);
    for (const seededLink of seededLinks) {
      assert.ok(!body.includes(seededLink));
    }
  }
});
