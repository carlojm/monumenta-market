// server/lib/verifyServer.js
//
// A tiny fake Minecraft server for account verification. A player joins it
// from their game; Mojang's normal online-mode login check proves they own
// the account and gives us their UUID. We never let them into a world: right
// after that check we kick them with a one-time code to enter on the site.

import crypto from 'node:crypto';
import mc from 'minecraft-protocol';
import db from '../db/init.js';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O or 1/I look-alikes
const CODE_LENGTH = 5;
const CODE_TTL_MINUTES = 10;

const findActiveCode = db.prepare(`
  SELECT code FROM verify_codes
  WHERE uuid = ? AND used_at IS NULL AND expires_at > CURRENT_TIMESTAMP
  ORDER BY created_at DESC LIMIT 1
`);
const insertCode = db.prepare(`
  INSERT INTO verify_codes (code, uuid, name, expires_at)
  VALUES (?, ?, ?, datetime('now', '+${CODE_TTL_MINUTES} minutes'))
`);
const deleteOldCodes = db.prepare("DELETE FROM verify_codes WHERE expires_at < datetime('now', '-1 day')");

const findAccountByUuid = db.prepare('SELECT id, name, banned_at FROM accounts WHERE uuid = ?');
const findOtherAccountByName = db.prepare('SELECT id, uuid, name FROM accounts WHERE name = ? AND uuid != ?');
const renameAccount = db.prepare('UPDATE accounts SET name = ? WHERE id = ?');

// Mojang just told us this UUID currently owns this name, so make our accounts
// agree. Exported for tests.
export const syncAccountName = db.transaction((uuid, name) => {
  // Another account still holding the name is stale: its owner renamed and
  // someone else took the name. Park it under a placeholder ("~" can't appear
  // in Minecraft names, so it never clashes); it's fixed when that owner rejoins.
  const stale = findOtherAccountByName.get(name, uuid);
  if (stale) {
    renameAccount.run(`${stale.name}~${stale.uuid.slice(0, 8)}`, stale.id);
    console.log(`verify: ${stale.name} now belongs to another player; parked the old account`);
  }

  // This player renamed in Minecraft (or changed capitalization): follow it.
  const account = findAccountByUuid.get(uuid);
  if (account && account.name !== name) {
    renameAccount.run(name, account.id);
    console.log(`verify: account renamed ${account.name} -> ${name}`);
  }
});

function randomCode() {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
  return code;
}

// Reuses the player's code if it's still valid, so rejoining doesn't pile up codes.
function codeFor(uuid, name) {
  const active = findActiveCode.get(uuid);
  if (active) return active.code;
  deleteOldCodes.run();
  for (;;) {
    const code = randomCode();
    try {
      insertCode.run(code, uuid, name);
      return code;
    } catch (err) {
      if (err.code !== 'SQLITE_CONSTRAINT_PRIMARYKEY') throw err; // same code already exists: pick another
    }
  }
}

// The kick screen, as a Minecraft text component.
function kickMessage(code) {
  return JSON.stringify({
    text: '',
    extra: [
      { text: 'Monumenta Market Directory\n\n', color: 'gray' },
      { text: 'Your code is ', color: 'white' },
      { text: code, color: 'green', bold: true },
      { text: `\n\nEnter it on the directory site within ${CODE_TTL_MINUTES} minutes.`, color: 'gray' },
    ],
  });
}

// `onlineMode` exists only for local tests of the kick flow without a real
// Mojang login. It must stay true in real use, or anyone could claim any name.
export function startVerifyServer(port, { onlineMode = true } = {}) {
  const server = mc.createServer({
    'online-mode': onlineMode,
    host: '0.0.0.0',
    port,
    version: false, // accept any client version the library knows...
    fallbackVersion: mc.supportedVersions.at(-1), // ...and try the newest for ones it doesn't
    // Server list description: title, then a grey second line.
    motd: 'Monumenta Market Directory',
    motdMsg: {
      text: 'Monumenta Market Directory\n',
      extra: [{ text: 'Join to get your verification code', color: 'gray' }],
    },
    maxPlayers: 1,
    hideErrors: true,
    // Runs right after Mojang confirms the player, while still in the login
    // phase, so we can kick before any world data (which differs per version).
    beforeLogin: (client) => {
      try {
        syncAccountName(client.uuid, client.username);
        // A banned account gets no code (claiming one is refused anyway).
        if (findAccountByUuid.get(client.uuid)?.banned_at) {
          console.log(`verify: refused a code to banned account ${client.username}`);
          return client.end('Banned', JSON.stringify({
            text: 'This Minecraft account has been banned from the Monumenta Market Directory.', color: 'red',
          }));
        }
        const code = codeFor(client.uuid, client.username);
        console.log(`verify: issued a code to ${client.username}`);
        client.end('Verification code issued', kickMessage(code));
      } catch (err) {
        console.error('verify: could not issue a code', err);
        client.end('Something went wrong, please try again later.');
      }
    },
  });

  server.on('listening', () => console.log(`Verify server listening on port ${port}`));
  server.on('error', (err) => console.error('verify server error:', err.message));
  return server;
}
