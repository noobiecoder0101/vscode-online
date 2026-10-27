// test/links.test.js
// Table-driven tests for classifyInviteLink and canonicalizeLink.

import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyInviteLink, canonicalizeLink } from '../src/utils/links.js';

test('classifyInviteLink table-driven tests (at least 25 cases)', () => {
  const cases = [
    // 1. Valid public telegram
    {
      url: 'https://t.me/durov',
      expected: { platform: 'telegram', kind: 'telegram_public', username: 'durov' },
    },
    // 2. Valid public telegram with trailing slash
    {
      url: 'https://t.me/my_channel_123/',
      expected: { platform: 'telegram', kind: 'telegram_public', username: 'my_channel_123' },
    },
    // 3. Valid telegram.me host
    {
      url: 'https://telegram.me/PublicGroup',
      expected: { platform: 'telegram', kind: 'telegram_public', username: 'PublicGroup' },
    },
    // 4. Valid telegram private with plus
    {
      url: 'https://t.me/+AbCdEfGh123',
      expected: { platform: 'telegram', kind: 'telegram_private', code: 'AbCdEfGh123' },
    },
    // 5. Valid telegram private with joinchat
    {
      url: 'https://t.me/joinchat/AbCdEfGh456',
      expected: { platform: 'telegram', kind: 'telegram_private', code: 'AbCdEfGh456' },
    },
    // 6. Valid discord.gg
    {
      url: 'https://discord.gg/GamingHub123',
      expected: { platform: 'discord', kind: 'discord_invite', code: 'GamingHub123' },
    },
    // 7. Valid discord.com/invite/
    {
      url: 'https://discord.com/invite/DiscordCode99',
      expected: { platform: 'discord', kind: 'discord_invite', code: 'DiscordCode99' },
    },
    // 8. Valid whatsapp
    {
      url: 'https://chat.whatsapp.com/KpL890JkLmN',
      expected: { platform: 'whatsapp', kind: 'whatsapp', code: 'KpL890JkLmN' },
    },
    // 9. Valid whatsapp with invite/
    {
      url: 'https://chat.whatsapp.com/invite/KpL890JkLmN',
      expected: { platform: 'whatsapp', kind: 'whatsapp', code: 'KpL890JkLmN' },
    },
    // 10. Valid reddit
    {
      url: 'https://www.reddit.com/r/technology/',
      expected: { platform: 'reddit', kind: 'other' },
    },
    // 11. Valid reddit without www
    {
      url: 'https://reddit.com/r/programming',
      expected: { platform: 'reddit', kind: 'other' },
    },
    // 12. Valid slack
    {
      url: 'https://join.slack.com/t/developers/shared_invite/zt-12345',
      expected: { platform: 'slack', kind: 'other' },
    },
    // 13. Valid signal
    {
      url: 'https://signal.group/#CjQKExampleHash',
      expected: { platform: 'signal', kind: 'other' },
    },
    // 14. Valid facebook
    {
      url: 'https://facebook.com/groups/TechInnovators/',
      expected: { platform: 'facebook', kind: 'other' },
    },
    // 15. Valid facebook www
    {
      url: 'https://www.facebook.com/groups/LocalGamers',
      expected: { platform: 'facebook', kind: 'other' },
    },
    // 16. Valid facebook mobile m.
    {
      url: 'https://m.facebook.com/groups/CoffeeLovers',
      expected: { platform: 'facebook', kind: 'other' },
    },
    // 17. Valid x.com
    {
      url: 'https://x.com/i/communities/1234567890',
      expected: { platform: 'x', kind: 'other' },
    },
    // 18. Valid twitter.com
    {
      url: 'https://twitter.com/i/communities/9876543210',
      expected: { platform: 'x', kind: 'other' },
    },
    // 19. Reject http://
    {
      url: 'http://t.me/durov',
      expected: null,
    },
    // 20. Reject javascript:
    {
      url: 'javascript:alert(1)',
      expected: null,
    },
    // 21. Reject look-alike host t.me.evil.com
    {
      url: 'https://t.me.evil.com/durov',
      expected: null,
    },
    // 22. Reject look-alike host evilt.me
    {
      url: 'https://evilt.me/durov',
      expected: null,
    },
    // 23. Reject userinfo trick https://t.me@evil.com
    {
      url: 'https://t.me@evil.com/durov',
      expected: null,
    },
    // 24. Reject userinfo trick on valid host https://user@t.me/durov
    {
      url: 'https://user:pass@t.me/durov',
      expected: null,
    },
    // 25. Reject discord.com without /invite/
    {
      url: 'https://discord.com/channels/123/456',
      expected: null,
    },
    // 26. Reject reddit.com without /r/
    {
      url: 'https://reddit.com/user/someone',
      expected: null,
    },
    // 27. Reject facebook.com without /groups/
    {
      url: 'https://facebook.com/profile.php?id=123',
      expected: null,
    },
    // 28. Reject x.com without /i/communities/
    {
      url: 'https://x.com/jack',
      expected: null,
    },
    // 29. Reject link longer than 300 characters
    {
      url: 'https://t.me/' + 'a'.repeat(301),
      expected: null,
    },
    // 30. Reject empty or non-string
    {
      url: '',
      expected: null,
    },
  ];

  for (const tc of cases) {
    const actual = classifyInviteLink(tc.url);
    assert.deepEqual(actual, tc.expected, `classifyInviteLink failed for ${tc.url}`);
  }
});

test('canonicalizeLink table-driven tests', () => {
  const cases = [
    // Public telegram: lowercase host and path, strip query/hash/trailing slash
    {
      input: 'https://TELEGRAM.ME/PublicUsername/?foo=bar#section',
      expected: 'https://t.me/publicusername',
    },
    // Private telegram: code case must be preserved
    {
      input: 'https://t.me/+AbCdEfGh123/?param=test',
      expected: 'https://t.me/+AbCdEfGh123',
    },
    // Private telegram joinchat: code case preserved
    {
      input: 'https://t.me/joinchat/AbCdEfGh456/',
      expected: 'https://t.me/joinchat/AbCdEfGh456',
    },
    // Discord: map discord.com/invite/ to discord.gg/, preserve code case
    {
      input: 'https://discord.com/invite/DiscordCode99/?ref=landing#tag',
      expected: 'https://discord.gg/DiscordCode99',
    },
    // Discord.gg: preserve code case, drop trailing slash
    {
      input: 'https://DISCORD.GG/GamingHub123/',
      expected: 'https://discord.gg/GamingHub123',
    },
    // WhatsApp: preserve code case
    {
      input: 'https://chat.whatsapp.com/KpL890JkLmN/',
      expected: 'https://chat.whatsapp.com/KpL890JkLmN',
    },
    // Reddit: drop www, preserve case
    {
      input: 'https://WWW.REDDIT.COM/r/LearnProgramming/?sort=new',
      expected: 'https://reddit.com/r/LearnProgramming',
    },
    // Facebook: drop www, strip trailing slash
    {
      input: 'https://www.facebook.com/groups/TechInnovators/',
      expected: 'https://facebook.com/groups/TechInnovators',
    },
  ];

  for (const tc of cases) {
    const actual = canonicalizeLink(tc.input);
    assert.equal(actual, tc.expected, `canonicalizeLink failed for ${tc.input}`);
  }
});
