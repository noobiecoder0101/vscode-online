// src/utils/links.js
// Invite link classification and canonicalization utilities.

const MAX_LINK_LENGTH = 300;

export function classifyInviteLink(url) {
  if (typeof url !== 'string' || url.length === 0 || url.length > MAX_LINK_LENGTH) {
    return null;
  }

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  if (parsed.protocol !== 'https:') {
    return null;
  }

  // Reject userinfo (e.g. https://user:pass@host)
  if (parsed.username || parsed.password) {
    return null;
  }

  // Reject non-standard ports
  if (parsed.port && parsed.port !== '443') {
    return null;
  }

  const hostname = parsed.hostname.toLowerCase();
  const pathname = parsed.pathname;

  // 1. Telegram: t.me, telegram.me
  if (hostname === 't.me' || hostname === 'telegram.me') {
    const rawPath = pathname.replace(/^\/+/, '');
    if (!rawPath) return null;

    if (rawPath.startsWith('+')) {
      const code = rawPath.slice(1).replace(/\/+$/, '');
      if (!code) return null;
      return { platform: 'telegram', kind: 'telegram_private', code };
    }

    if (rawPath.startsWith('joinchat/')) {
      const code = rawPath.slice('joinchat/'.length).replace(/\/+$/, '');
      if (!code) return null;
      return { platform: 'telegram', kind: 'telegram_private', code };
    }

    // Public telegram handle: must be a single segment alphanumeric/underscore
    const cleanUsername = rawPath.replace(/\/+$/, '');
    if (!cleanUsername || cleanUsername.includes('/')) return null;
    if (!/^[a-zA-Z0-9_]+$/.test(cleanUsername)) return null;

    return { platform: 'telegram', kind: 'telegram_public', username: cleanUsername };
  }

  // 2. Discord: discord.gg, discord.com/invite/
  if (hostname === 'discord.gg') {
    const code = pathname.replace(/^\/+|\/+$/g, '');
    if (!code || code.includes('/')) return null;
    return { platform: 'discord', kind: 'discord_invite', code };
  }

  if (hostname === 'discord.com') {
    if (!pathname.startsWith('/invite/')) return null;
    const code = pathname.slice('/invite/'.length).replace(/^\/+|\/+$/g, '');
    if (!code || code.includes('/')) return null;
    return { platform: 'discord', kind: 'discord_invite', code };
  }

  // 3. WhatsApp: chat.whatsapp.com
  if (hostname === 'chat.whatsapp.com') {
    let code = pathname.replace(/^\/+|\/+$/g, '');
    if (code.startsWith('invite/')) {
      code = code.slice('invite/'.length).replace(/^\/+|\/+$/g, '');
    }
    if (!code || code.includes('/')) return null;
    return { platform: 'whatsapp', kind: 'whatsapp', code };
  }

  // 4. Reddit: reddit.com, www.reddit.com, path /r/
  if (hostname === 'reddit.com' || hostname === 'www.reddit.com') {
    if (!pathname.startsWith('/r/')) return null;
    const sub = pathname.slice('/r/'.length).replace(/^\/+|\/+$/g, '').split('/')[0];
    if (!sub) return null;
    return { platform: 'reddit', kind: 'other' };
  }

  // 5. Slack: join.slack.com
  if (hostname === 'join.slack.com') {
    const clean = pathname.replace(/^\/+|\/+$/g, '');
    if (!clean) return null;
    return { platform: 'slack', kind: 'other' };
  }

  // 6. Signal: signal.group
  if (hostname === 'signal.group') {
    return { platform: 'signal', kind: 'other' };
  }

  // 7. Facebook: facebook.com, www.facebook.com, m.facebook.com, path /groups/
  if (hostname === 'facebook.com' || hostname === 'www.facebook.com' || hostname === 'm.facebook.com') {
    if (!pathname.startsWith('/groups/')) return null;
    const group = pathname.slice('/groups/'.length).replace(/^\/+|\/+$/g, '').split('/')[0];
    if (!group) return null;
    return { platform: 'facebook', kind: 'other' };
  }

  // 8. X: x.com, twitter.com, path /i/communities/
  if (hostname === 'x.com' || hostname === 'twitter.com') {
    if (!pathname.startsWith('/i/communities/')) return null;
    const comm = pathname.slice('/i/communities/'.length).replace(/^\/+|\/+$/g, '').split('/')[0];
    if (!comm) return null;
    return { platform: 'x', kind: 'other' };
  }

  return null;
}

export function canonicalizeLink(url) {
  if (typeof url !== 'string' || !url.trim()) return null;

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  let host = parsed.hostname.toLowerCase();
  if (host.startsWith('www.')) {
    host = host.slice(4);
  }

  if (host === 'telegram.me') {
    host = 't.me';
  }

  let pathname = parsed.pathname;

  if (host === 'discord.com' && pathname.startsWith('/invite/')) {
    host = 'discord.gg';
    pathname = pathname.slice('/invite'.length);
  }

  // Strip trailing slash
  if (pathname.length > 1 && pathname.endsWith('/')) {
    pathname = pathname.replace(/\/+$/, '');
  } else if (pathname === '/') {
    pathname = '';
  }

  // Lowercase the path only for public Telegram usernames. Never lowercase invite codes.
  if (host === 't.me') {
    if (!pathname.startsWith('/+') && !pathname.startsWith('/joinchat/')) {
      pathname = pathname.toLowerCase();
    }
  }

  return `https://${host}${pathname}`;
}
