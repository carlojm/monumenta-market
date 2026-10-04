// server/db/seed_full.js
//
// Full import from "Monumenta Market Directory Guide as of Nov 2025".
// This WIPES plots, comments, and images before reloading — run it once
// to replace the 3 hand-entered test plots with the real data.
//
// Usage: place this at server/db/seed_full.js and run `node db/seed_full.js`
// (or add a "seed:full" script to package.json).
//
// NOTES ON JUDGMENT CALLS — review these after seeding:
// - Plots with no coordinates in the doc (bulk mentions like "3 empty
//   unclaimed plots", "5 claimed but empty plots: SPM0, FaiNeko, qlsj,
//   meouo, MagicMango1027") are NOT included — no coords to place them.
// - Where a plot changed hands (shown as strikethrough old owner +
//   "replaced by X" note), only the CURRENT owner is the live record;
//   the change is preserved as a comment.
// - altephcomputer2 moved from -610,1150 to -630,1140 (taking over
//   Vocracity's old spot). Both plots are seeded: the old spot as
//   empty/historical, the new spot as altephcomputer2's live shop.
// - "wokif" is used as the current owner for the shop at -630,990
//   (doc questions whether this shop was always owned by wokif vs
//   9tynine_ — both names are kept in the description).
// - Status values are a best-effort guess from the most recent note
//   (active / locked / closed / unclear) — tweak freely in admin.

import db from './init.js';

const AUTHOR = 'carlo_m';

function d(dateStr) {
  return `${dateStr}T12:00:00Z`;
}

const plots = [
  // ---------------- LIME ----------------
  {
    x: -640, z: 960, owner: 'HuiyingZz', shop_name: null, zone: 'Lime', status: 'active', is_guild: 0,
    description: 'Mainly a CZ Charm set rental shop, also has gear for rent: Hrimnir\'s Frosted Eye (hoped by weekendtech), Bouquet of Gold (hoped by Fracture_Yen), Myrahg\'s Pestilence (hoped by Moe_Muyo). Pickaxe rentals (all infused): Pureshard Adze 4*, Gem-Tipped Boilerdrill 4*, The Overclocker 4*, Supernova Mattock 4*. Gearset rentals: R3 proj set, R3 caster set. Block palette: Blackstone.',
    comments: [
      { date: d('2025-10-04'), body: 'Still here, same offerings.' },
      { date: d('2025-11-08'), body: 'Still here, updated entry to be more detailed.' },
    ],
  },
  {
    x: -650, z: 960, owner: '_FoxArctic_', shop_name: null, zone: 'Lime', status: 'active', is_guild: 0,
    description: 'R3 Stonks: legendary charm, epic charm, rare charms, colossal cognac, terrestrial sinew uamiel mat, experience stash, consuming elixir, greater experience stash. Potion carrier stonks: carrier of Lucky Starbrew, carrier of Wolfswood\'s Fury. New stonks: Bag of tricks, circus tickets. Rush of dissonance tenebrist rental set. Free chorus fruit. Block palette: Oak and glass.',
    comments: [
      { date: d('2025-10-04'), body: 'Still here but locked right now.' },
      { date: d('2025-11-08'), body: 'No longer locked, a few new offerings.' },
    ],
  },
  {
    x: -660, z: 960, owner: 'Holy__Cat', shop_name: 'CAT', zone: 'Lime', status: 'locked', is_guild: 0,
    description: 'R3 rare charm stonks, repair anvil stonks. R3 Rares buy/sell. Block palette: Quartz.',
    comments: [
      { date: d('2025-10-04'), body: 'Still here but locked right now.' },
      { date: d('2025-11-08'), body: 'Locked.' },
    ],
  },
  {
    x: -660, z: 980, owner: 'HKGamerNoob', shop_name: null, zone: 'Lime', status: 'active', is_guild: 0,
    description: 'Season pass artifact trades, currently has: steel apparatus, chillwind overcoat, ishnir\'s moon. Various rares/artis from each region, WTT for equal value based on NPC price. R1: corrupted water robe, petrified runeplate, aphelion\'s gift. R2: seeker\'s pursuit, k\'x\'aehdd (darkest depths arti). R3: circuit breaker, roots of influence, shooting star, death\'s gaze. Selling liferoot sapling. SKR lore book library. Block palette: Spruce wood and quartz.',
    comments: [
      { date: d('2025-10-04'), body: 'Still here, same offerings.' },
      { date: d('2025-11-08'), body: 'Same offerings, updated entry to include item names.' },
    ],
  },
  {
    x: -640, z: 980, owner: 'Eyjafjala', shop_name: null, zone: 'Lime', status: 'unclear', is_guild: 0,
    description: '"Eyjafjala charm pickup." Quartz structure with a dragon egg in the middle.',
    comments: [
      { date: d('2025-10-04'), body: 'Still nothing here besides the build.' },
      { date: d('2025-11-08'), body: 'Still sittin here.' },
    ],
  },
  {
    x: -640, z: 970, owner: 'Hibikies', shop_name: null, zone: 'Lime', status: 'locked', is_guild: 0,
    description: 'Buying R1 and R2 wool trophies. Stone bricks with black concrete basement.',
    comments: [
      { date: d('2025-11-08'), body: 'NEW! But currently locked.' },
    ],
  },

  // ---------------- MAGENTA ----------------
  {
    x: -660, z: 1000, owner: 'Palae', shop_name: null, zone: 'Magenta', status: 'locked', is_guild: 0,
    description: 'A hole. Black concrete.',
    comments: [
      { date: d('2025-10-04'), body: 'Still a hole. Now has a "WTB gladiolus" sign.' },
      { date: d('2025-11-08'), body: 'Currently locked.' },
    ],
  },
  {
    x: -650, z: 1000, owner: 'KH2Roxas', shop_name: null, zone: 'Magenta', status: 'locked', is_guild: 0,
    description: 'R1, R2, R3 rares. R1, R2, R3 mats. Locked as of 9/7. Block palette: Copper and deep slate.',
    comments: [
      { date: d('2025-10-04'), body: 'No longer locked!' },
      { date: d('2025-11-08'), body: 'Same offerings, currently locked.' },
    ],
  },
  {
    x: -640, z: 1000, owner: 'sNigth', shop_name: null, zone: 'Magenta', status: 'unclear', is_guild: 0,
    description: 'Currently not buying/selling. According to sNigth, just storage for 99\'s shop across from it. Block palette: Mud, brick, spruce.',
    comments: [
      { date: d('2025-10-04'), body: 'Still not selling.' },
      { date: d('2025-11-08'), body: 'Still here.' },
    ],
  },
  {
    x: -640, z: 1010, owner: 'Cocoa_B', shop_name: null, zone: 'Magenta', status: 'active', is_guild: 0,
    description: 'Just about every R1, R2 rare for rent, currently free rental. Lesser charms for sale. Some misc. barrels like charms and zenith rares for sale. Block palette: Quartz and blue glass.',
    comments: [
      { date: d('2025-10-04'), body: 'Still has a great rare rental inventory. NEW: lesser charm taxless stonk market in basement.' },
      { date: d('2025-11-08'), body: 'Still great.' },
    ],
  },
  {
    x: -660, z: 1010, owner: 'CallMe_Chocolate', shop_name: null, zone: 'Magenta', status: 'locked', is_guild: 0,
    description: 'Currently locked, seems to have some charms. Empty plot with barrels.',
    comments: [
      { date: d('2025-10-04'), body: 'Unlocked, WIP charm rental shop?' },
      { date: d('2025-11-08'), body: 'Locked.' },
    ],
  },
  {
    x: -660, z: 1020, owner: 'HermitMonk', shop_name: 'HermitMonk\'s Market Directory', zone: 'Magenta', status: 'active', is_guild: 0,
    description: 'The original in-game market directory that this site is based on.',
    comments: [
      { date: d('2025-10-04'), body: 'Still so freaking awesome. Unfortunately the two guilds in front of us have finally built shops and we no longer have clear line of sight to the middle of the island.' },
      { date: d('2025-11-08'), body: 'The best! Have we updated the signs to reflect October changes? No... but might really update them for the November changelog.' },
    ],
  },
  {
    x: -650, z: 1020, owner: 'Alaethor', shop_name: null, zone: 'Magenta', status: 'active', is_guild: 0,
    description: 'Selling silver knight\'s remnants (SKR) rares, multiple of each rare for sale. Buying SKR scroll remnant scrolls for 5.5har. Block palette: Stone bricks.',
    comments: [
      { date: d('2025-10-04'), body: 'Magic58994 (previous occupant): still locked.' },
      { date: d('2025-11-08'), body: 'Magic58994 closed, replaced by Alaethor.' },
      { date: d('2025-11-08'), body: 'Alaethor: NEW!' },
    ],
  },
  {
    x: -640, z: 1020, owner: 'JackStrongBr', shop_name: null, zone: 'Magenta', status: 'locked', is_guild: 0,
    description: 'Selling potion carriers, dreadful damassine, infernal izarra, twisted tepache.',
    comments: [
      { date: d('2025-10-04'), body: 'TonyStar123 (previous occupant): still locked.' },
      { date: d('2025-11-08'), body: 'TonyStar123 closed, replaced by JackStrongBr.' },
      { date: d('2025-11-08'), body: 'JackStrongBr: NEW! But currently locked.' },
    ],
  },

  // ---------------- EPHEMERAL CORRIDORS ----------------
  {
    x: -690, z: 980, owner: 'skelajon', shop_name: null, zone: 'Ephemeral Corridors', status: 'active', is_guild: 0,
    description: 'Slime shop for slimey needs. Block palette: Dark oak and green.',
    comments: [
      { date: d('2025-10-04'), body: 'Still open.' },
      { date: d('2025-11-10'), body: 'Still open but currently sold out. Everyone ping skelajon.' },
    ],
  },
  {
    x: -680, z: 980, owner: 'skelematt', shop_name: null, zone: 'Ephemeral Corridors', status: 'active', is_guild: 0,
    description: 'Everything EC related: artis, discs, and requests. Block palette: Nether brick and mangrove.',
    comments: [
      { date: d('2025-10-04'), body: 'Still open.' },
      { date: d('2025-11-10'), body: 'Still open and stocked.' },
    ],
  },
  {
    x: -670, z: 980, owner: 'Lucilite', shop_name: null, zone: 'Ephemeral Corridors', status: 'locked', is_guild: 0,
    description: 'Potions in bulk. R1 rares for sale. Block palette: Moss.',
    comments: [
      { date: d('2025-10-04'), body: 'Currently locked, seemingly same inventory.' },
      { date: d('2025-11-10'), body: 'Currently locked.' },
    ],
  },
  {
    x: -670, z: 990, owner: 'TrueCon', shop_name: null, zone: 'Ephemeral Corridors', status: 'closed', is_guild: 0,
    description: 'Plot is gone as of October 2025. Previously: misc barrels, an "awesome review wall". Block palette: Calcite and warped wood.',
    comments: [
      { date: d('2025-10-04'), body: 'Gone.' },
    ],
  },

  // ---------------- PURPLE ----------------
  {
    x: -610, z: 980, owner: 'CookieFace7', shop_name: 'B2B', zone: 'Purple', status: 'active', is_guild: 0,
    description: 'Brought to you by [EN]. Lesser charms for sale. Misc stonks, PDIA, ADE. "Portable cornifer." "Portable boons." Darkest depths disc sets. Bare plot, just barrels and oak signs.',
    comments: [
      { date: d('2025-10-04'), body: 'New R3 overworld rare/frag stonk.' },
      { date: d('2025-11-10'), body: 'Now has darkest depths disc sets.' },
    ],
  },
  {
    x: -620, z: 980, owner: 'Rain_stxrm', shop_name: 'Also b2b', zone: 'Purple', status: 'unclear', is_guild: 0,
    description: 'Also a bare plot, extension of the B2B group.',
    comments: [
      { date: d('2025-10-04'), body: 'Still empty.' },
      { date: d('2025-11-10'), body: 'Still empty.' },
    ],
  },
  {
    x: -610, z: 990, owner: 'Th3_Traveller', shop_name: 'Also b2b', zone: 'Purple', status: 'unclear', is_guild: 0,
    description: 'Also a bare plot, extension of the B2B group.',
    comments: [
      { date: d('2025-10-04'), body: 'Fezzic\'s plot now, but still an empty b2b extension.' },
      { date: d('2025-11-10'), body: 'Still empty.' },
    ],
  },
  {
    x: -630, z: 990, owner: 'wokif', shop_name: null, zone: 'Purple', status: 'active', is_guild: 0,
    description: 'Also known/listed as 9tynine_. Rare charms for sale: indigo, blue, brown, SKT, wolfswood, starpoint, pelias. Many rental sets: R1 armor rogue, R1 agility rogue, R2 speed lootrun set, R2 rogue, R2 tank lootrun set, R2 warlock. Many epics for rent, some free some paid. Delve dummy eggs for sale in B1. R1/R2 rares and artis for sale. CZ rares "buy for 80% npc price." Block palette: Oak, mud, pink.',
    comments: [
      { date: d('2025-10-04'), body: 'Still running, still great stock.' },
      { date: d('2025-11-10'), body: 'Still runnin, entry updated to be more detailed. Was this shop always owned by wokif? It still says 99 on the signage.' },
    ],
  },
  {
    x: -610, z: 1000, owner: 'Alecaboo', shop_name: 'Alecastore', zone: 'Purple', status: 'locked', is_guild: 0,
    description: 'Some rental sets, currently locked. Block palette: Calcite and moss.',
    comments: [
      { date: d('2025-10-04'), body: 'Still locked.' },
      { date: d('2025-11-10'), body: 'Still locked.' },
    ],
  },
  {
    x: -630, z: 1000, owner: 'JimmyAurum', shop_name: null, zone: 'Purple', status: 'unclear', is_guild: 0,
    description: 'WIP. Block palette: Blackstone and barrels.',
    comments: [
      { date: d('2025-10-04'), body: 'Still WIP.' },
      { date: d('2025-11-10'), body: 'Still WIP.' },
    ],
  },
  {
    x: -630, z: 980, owner: 'UltimateDude16', shop_name: null, zone: 'Purple', status: 'unclear', is_guild: 0,
    description: 'Also known as UltimateMooo (owner name changed at some point).',
    comments: [
      { date: d('2025-10-04'), body: 'NEW! But locked. WIP.' },
      { date: d('2025-11-10'), body: 'There\'s water here now, also owner name changed, but still not selling anything.' },
    ],
  },

  // ---------------- PINK ----------------
  {
    x: -700, z: 1030, owner: 'APliterature', shop_name: null, zone: 'Pink', status: 'closed', is_guild: 0,
    description: 'Plot is gone as of November 2025. Previously: WIP, currently locked; dummy, disc, mat, charm exchange. Block palette: Oak, acacia, green.',
    comments: [
      { date: d('2025-10-04'), body: 'Still locked.' },
      { date: d('2025-11-12'), body: 'Gone.' },
    ],
  },
  {
    x: -700, z: 1040, owner: 'miraclemachine', shop_name: null, zone: 'Pink', status: 'active', is_guild: 0,
    description: 'Zenith Charms. BIN and auction and WTB and WTS. Block palette: Blue/white warped wood.',
    comments: [
      { date: d('2025-09-22'), body: 'Has a shop now!' },
      { date: d('2025-10-04'), body: 'See above update.' },
      { date: d('2025-11-12'), body: 'Still runnin.' },
    ],
  },
  {
    x: -720, z: 1030, owner: 'dorky_', shop_name: 'Teensy Tiny Tavern', zone: 'Pink', status: 'active', is_guild: 0,
    description: '"All profit is turned into chips" based. R3 casino item stonks: potions, food, arrows. Block palette: Spruce wood and cyan/gray terracotta.',
    comments: [
      { date: d('2025-10-06'), body: 'New!' },
      { date: d('2025-11-12'), body: 'Now has consumable stonks in the basement.' },
    ],
  },
  {
    x: -700, z: 1050, owner: 'Gonzelk', shop_name: null, zone: 'Pink', status: 'locked', is_guild: 0,
    description: 'R123 general gear store, rares, artis. Currently locked. "Penguin." Block palette: Spruce, moss, and wheat.',
    comments: [
      { date: d('2025-10-06'), body: 'Still locked.' },
      { date: d('2025-11-12'), body: 'Still locked.' },
    ],
  },
  {
    x: -710, z: 1050, owner: 'cartsinabag', shop_name: null, zone: 'Pink', status: 'locked', is_guild: 0,
    description: 'WIP and locked. Block palette: End city.',
    comments: [
      { date: d('2025-10-06'), body: 'Still locked.' },
      { date: d('2025-11-12'), body: 'Still locked.' },
    ],
  },

  // ---------------- LABS ----------------
  {
    x: -670, z: 1010, owner: 'TKTOM7', shop_name: null, zone: 'Labs', status: 'unclear', is_guild: 0,
    description: 'Fishy deals. Cool plot that lets you buy carriers of blocks when the lights are on, but hasn\'t been seen stocked. Block palette: Ocean monument, water, and grass.',
    comments: [
      { date: d('2025-10-06'), body: 'Still empty.' },
      { date: d('2025-11-12'), body: 'Lights still off.' },
    ],
  },
  {
    x: -670, z: 1020, owner: 'KitSwift', shop_name: null, zone: 'Labs', status: 'active', is_guild: 0,
    description: 'General store. Block palette: Black and gray concrete, and purple.',
    comments: [
      { date: d('2025-10-06'), body: 'Open now! Selling assorted R1/R2 artis and rares, R3 rares.' },
      { date: d('2025-11-12'), body: 'Still stocked and runnin.' },
    ],
  },
  {
    x: -670, z: 1030, owner: 'Enderchen2580', shop_name: null, zone: 'Labs', status: 'active', is_guild: 0,
    description: 'Zenith rares, charms, and niche R2 stonks. Free food barrel. Block carriers and R2/R3 rares for sale. Block palette: End stone and purpur.',
    comments: [
      { date: d('2025-10-06'), body: 'Still running and stocked!' },
      { date: d('2025-11-12'), body: 'Still stocked and runnin.' },
    ],
  },
  {
    x: -680, z: 1030, owner: 'Arokv', shop_name: null, zone: 'Labs', status: 'active', is_guild: 0,
    description: 'R3 taxless rare exchange. Arrows and blocks. Block palette: Warped wood.',
    comments: [
      { date: d('2025-10-06'), body: 'Still running and stocked!' },
      { date: d('2025-11-12'), body: 'Still stocked and runnin.' },
    ],
  },
  {
    x: -690, z: 1030, owner: 'HelylookMeltan', shop_name: null, zone: 'Labs', status: 'active', is_guild: 0,
    description: 'R1 and R3 rare frag stonks. R2 WIP. Block palette: Stone brick and barrels.',
    comments: [
      { date: d('2025-10-06'), body: 'Still partially WIP but stocked.' },
      { date: d('2025-11-12'), body: 'Still partially WIP but stocked.' },
    ],
  },

  // ---------------- WHITE ----------------
  {
    x: -630, z: 1010, owner: 'ToyBoxes', shop_name: null, zone: 'White', status: 'active', is_guild: 0,
    description: 'Hexfall encounter rush set, free rental. Just stone bricks and barrels.',
    comments: [
      { date: d('2025-10-06'), body: 'Currently locked.' },
      { date: d('2025-11-12'), body: 'Stock changed, now there\'s a rental set.' },
    ],
  },
  {
    x: -630, z: 1020, owner: 'VenKleftis', shop_name: null, zone: 'White', status: 'locked', is_guild: 0,
    description: '"A locked tomb... beware of ghosts." Block palette: Stone bricks, gravel, dirt, moss.',
    comments: [
      { date: d('2025-10-06'), body: 'Still haunted.' },
      { date: d('2025-11-12'), body: 'Haunted.' },
    ],
  },
  {
    x: -630, z: 1030, owner: 'Peli', shop_name: 'TONK', zone: 'White', status: 'active', is_guild: 0,
    description: 'Charm stonks by each tier on F1. Niche stonks on F2: XP Stash, Shulker Frag, EC Key Frag, godspore mats (Tainted Spores, Toxin, Roots). Block palette: Mossy.',
    comments: [
      { date: d('2025-10-06'), body: 'Still open and stocked.' },
      { date: d('2025-11-12'), body: 'Still open and stocked.' },
    ],
  },
  {
    x: -620, z: 1030, owner: '_Harshi', shop_name: 'TOST', zone: 'White', status: 'active', is_guild: 0,
    description: 'R2 currency and niche stonks: Ethereal Rib, Flittering Sparks, Dormant Halloween Spirit, Abyssal Amulet, Permafrost Denarius, Eternity Gem, Downfall, Cols. Core, Heart of Dread. Block palette: Mossy.',
    comments: [
      { date: d('2025-10-06'), body: 'Still open and stocked.' },
      { date: d('2025-11-12'), body: 'Still open and stocked.' },
    ],
  },
  {
    x: -610, z: 1030, owner: 'weekendtech', shop_name: 'Mini Stonkco 2', zone: 'White', status: 'active', is_guild: 0,
    description: 'Lesser charm stonks. WIP. Block palette: Stonkco blocks (quartz, emerald).',
    comments: [
      { date: d('2025-10-06'), body: 'Still WIP but has some stonks available.' },
      { date: d('2025-11-12'), body: 'Still WIP with some stock. WTB lacerating charms.' },
    ],
  },
  {
    x: -610, z: 1020, owner: 'needmoney91', shop_name: 'Mini Stonkco 4', zone: 'White', status: 'active', is_guild: 0,
    description: 'True North stonks. Block palette: Stonkco blocks.',
    comments: [
      { date: d('2025-10-06'), body: 'Still open and stonked.' },
      { date: d('2025-11-12'), body: 'Runnin.' },
    ],
  },
  {
    x: -610, z: 1010, owner: 'Shining_Cat', shop_name: 'Mini Stonkco', zone: 'White', status: 'unclear', is_guild: 0,
    description: 'WIP.',
    comments: [
      { date: d('2025-10-06'), body: 'Still WIP.' },
      { date: d('2025-11-12'), body: 'There is a single furnace smelting a barrel full of carriers full of sand. Good luck to this poor furnace.' },
    ],
  },
  {
    x: -620, z: 1010, owner: 'minerdwarf222', shop_name: 'Mini Stonkco', zone: 'White', status: 'locked', is_guild: 0,
    description: 'WIP.',
    comments: [
      { date: d('2025-10-06'), body: 'Still WIP, "PawnCo" coming soon.' },
      { date: d('2025-11-12'), body: 'Still WIP, locked.' },
    ],
  },

  // ---------------- LIGHT GRAY ----------------
  {
    x: -600, z: 1050, owner: 'marcywawa', shop_name: null, zone: 'Light Gray', status: 'active', is_guild: 0,
    description: 'Really cool banner art, worth standing here for ten minutes and just looking at it.',
    comments: [
      { date: d('2025-10-06'), body: 'Ian1KV (previous occupant): MOVED! T5 exchange now next door in the [VEIL] guild shop.' },
      { date: d('2025-11-12'), body: 'Ian1KV\'s old plot replaced with marcywawa.' },
      { date: d('2025-11-12'), body: 'marcywawa: NEW!' },
    ],
  },
  {
    x: -600, z: 1040, owner: 'Ryakuu', shop_name: 'kitty kats shop', zone: 'Light Gray', status: 'active', is_guild: 0,
    description: 'Zenith charm stonks. Zenith and R3 overworld rental sets in basement. Block palette: Cherry wood, all pink.',
    comments: [
      { date: d('2025-10-06'), body: 'Still running and stocked!' },
      { date: d('2025-11-12'), body: 'Stock expanding, "we have all sets and charms done but dawn" -Ryakuu.' },
    ],
  },
  {
    x: -600, z: 1030, owner: 'fishy3927', shop_name: 'Mini StonkCo 5', zone: 'Light Gray', status: 'locked', is_guild: 0,
    description: 'WIP. WTB 5* fish. Block palette: Stonkco blocks.',
    comments: [
      { date: d('2025-10-06'), body: 'Currently locked and WIP.' },
      { date: d('2025-11-12'), body: 'Currently locked and WIP.' },
    ],
  },
  {
    x: -590, z: 1030, owner: 'Akuser1reta', shop_name: null, zone: 'Light Gray', status: 'unclear', is_guild: 0,
    description: 'Empty plot.',
    comments: [
      { date: d('2025-10-06'), body: 'labierl (previous occupant): NEW! But WIP and empty, big hole full of water.' },
      { date: d('2025-11-12'), body: 'labierl\'s old plot replaced with Akuser1reta.' },
      { date: d('2025-11-12'), body: 'Akuser1reta: NEW! But empty.' },
    ],
  },
  {
    x: -590, z: 1050, owner: 'Reeba', shop_name: null, zone: 'Light Gray', status: 'unclear', is_guild: 0,
    description: 'Big hole, not full of water.',
    comments: [
      { date: d('2025-10-06'), body: 'NEW! But also WIP and empty.' },
      { date: d('2025-11-12'), body: 'Still empty.' },
    ],
  },
  {
    x: -580, z: 1050, owner: 'carasouels', shop_name: null, zone: 'Light Gray', status: 'active', is_guild: 0,
    description: 'Kitten Patron item shop. Stock: Eclipse Splitter, Lamb Chop, Big Hat, Vivace, Jeans of the Fire Eagle, Embers of Thori\'dal, Gas Mask, Heaven\'s Lullaby, Peripatetic Sandals. Also (no own barrels): Baxeico, Heiress\' Rapier, Crown of the Depths, Doomsday Clock, Failnaught. Other items: Shadebound Shackles, Godtree Greaves, Razorleaf Breeches, Silver Heart, Morphic Breaker, The Overclocker, Toxic-Cursed Bind, Across the Ocean, Short Circuit, Loci\'s Hunger. Block palette: Black and lime concrete, lime glass, pride flags.',
    comments: [
      { date: d('2025-10-06'), body: 'New but WIP.' },
      { date: d('2025-11-12'), body: 'NEW!' },
    ],
  },
  {
    x: -580, z: 1040, owner: 'niirvus', shop_name: null, zone: 'Light Gray', status: 'unclear', is_guild: 0,
    description: 'Just a bunch of random blocks placed on the plot.',
    comments: [
      { date: d('2025-10-06'), body: 'NEW! And also empty!!' },
      { date: d('2025-11-12'), body: 'Still WIP, Ryakuu told me what this is going to be and I forgot. CZ rares or something.' },
    ],
  },
  {
    x: -580, z: 1030, owner: 'sleepyemmaline', shop_name: null, zone: 'Light Gray', status: 'active', is_guild: 0,
    description: 'Kitten\'s Instant Epic Infusion service — take fully infused true norths, refund the infusion, then use that on your item. Water and prismarine shop shaped like an exp bottle.',
    comments: [],
  },

  // ---------------- WILLOWS ----------------
  {
    x: -700, z: 1060, owner: 'juicyradish', shop_name: null, zone: 'Willows', status: 'active', is_guild: 0,
    description: 'GPT potion rental. Buying heal potions. Big potion build on top. Block palette: Warped and deep slate.',
    comments: [
      { date: d('2025-10-06'), body: 'Still open, might need some restocking.' },
      { date: d('2025-11-12'), body: 'Still open and stocked.' },
    ],
  },
  {
    x: -700, z: 1070, owner: 'Geek1001', shop_name: 'COMEX', zone: 'Willows', status: 'active', is_guild: 0,
    description: 'Giveaways. Free pride flags. Block palette: Emerald blocks, lime, gold, grass.',
    comments: [
      { date: d('2025-10-06'), body: 'Locked, no giveaway active currently.' },
      { date: d('2025-11-12'), body: 'Unlocked but nothin going on right now.' },
    ],
  },
  {
    x: -700, z: 1080, owner: 'TheLegend001B', shop_name: 'Depths Inc', zone: 'Willows', status: 'locked', is_guild: 0,
    description: 'Depths shop, currently locked. Block palette: Deep slate and cyan.',
    comments: [
      { date: d('2025-10-06'), body: 'Still locked.' },
      { date: d('2025-11-12'), body: 'Still locked.' },
    ],
  },
  {
    x: -710, z: 1080, owner: 'TemberCasa', shop_name: null, zone: 'Willows', status: 'unclear', is_guild: 0,
    description: 'Christmas plot. Big Christmas tree. Unclear purpose, maybe a secret Santa thing.',
    comments: [
      { date: d('2025-10-06'), body: 'Still dormant.' },
      { date: d('2025-11-12'), body: 'Thawing soon?' },
    ],
  },
  {
    x: -720, z: 1080, owner: 'Moe_block', shop_name: null, zone: 'Willows', status: 'unclear', is_guild: 0,
    description: 'Also a Christmas plot. Snowman.',
    comments: [
      { date: d('2025-10-06'), body: 'Still dormant.' },
      { date: d('2025-11-12'), body: 'Is it time yet?' },
    ],
  },

  // ---------------- CYAN ----------------
  {
    x: -720, z: 1090, owner: 'JAY_zixuan', shop_name: null, zone: 'Cyan', status: 'unclear', is_guild: 0,
    description: 'Another Christmas plot. Big present.',
    comments: [
      { date: d('2025-10-06'), body: 'Still dormant.' },
      { date: d('2025-11-12'), body: '...' },
    ],
  },
  {
    x: -710, z: 1090, owner: 'Firestorm256', shop_name: null, zone: 'Cyan', status: 'active', is_guild: 0,
    description: 'R1/R2 rares stonks. Block palette: Dark oak, oak.',
    comments: [
      { date: d('2025-10-06'), body: 'Still open and stocked.' },
      { date: d('2025-11-12'), body: 'Still runnin.' },
    ],
  },
  {
    x: -700, z: 1110, owner: 'Col7', shop_name: null, zone: 'Cyan', status: 'active', is_guild: 0,
    description: 'R3 rares, potions, lesser charms, augments. Free food barrel. Block palette: Copper, deep slate.',
    comments: [
      { date: d('2025-10-06'), body: 'Still open, selling R3 potion carriers, block carriers (stone, copper, misc.), misc. items (Rocket Boots, Crown of the Lost Beyond, Duskborn Graft), as well as stuff listed above.' },
      { date: d('2025-11-12'), body: 'Still runnin.' },
    ],
  },
  {
    x: -700, z: 1090, owner: 'Shireee', shop_name: null, zone: 'Cyan', status: 'active', is_guild: 0,
    description: 'Maple syrup stonk, Creeper delight stonk, ADE stonk, SKT rare frag stonk. Selling food, lapis, R2 rares. Rush of dissonance set for rental. Offering intruder carry service.',
    comments: [
      { date: d('2025-11-12'), body: 'NEW! Still runnin.' },
    ],
  },

  // ---------------- LIGHT BLUE ----------------
  {
    x: -670, z: 1110, owner: 'TimTaroo', shop_name: null, zone: 'Light Blue', status: 'active', is_guild: 0,
    description: 'EC discs, DD discs, EC artis for sale. Free pottery sherds for borrowing. Now also selling CZ rares. Block palette: Sick elevator, black concrete.',
    comments: [
      { date: d('2025-10-06'), body: 'pPlys (previous occupant): gone! Now TimTaroo\'s plot.' },
      { date: d('2025-10-06'), body: 'TimTaroo: NEW!' },
      { date: d('2025-11-12'), body: 'Now selling CZ rares, elevator still awesome.' },
    ],
  },
  {
    x: -670, z: 1120, owner: 'dearboy', shop_name: null, zone: 'Light Blue', status: 'active', is_guild: 0,
    description: 'Hexfall and zenith free rental sets. R2 glass DPS rental set. Block palette: Dark oak with blue crystal above, mud, moss.',
    comments: [
      { date: d('2025-10-06'), body: 'Still open and stocked with rental sets.' },
      { date: d('2025-11-12'), body: 'New acumen rental set.' },
    ],
  },
  {
    x: -670, z: 1130, owner: 'greenfroge', shop_name: 'The Advancement Store', zone: 'Light Blue', status: 'locked', is_guild: 0,
    description: 'Free rental items for completing advancements. Also offers a gear rental set for "Trio Mage Sirius," dungeon race key rentals, cornifer summoning crystal borrows, "Bring Him Baaack" item set rentals, borrowable replica rose wool (most have fees; ground floor advancement items are free to use).',
    comments: [
      { date: d('2025-10-06'), body: 'Unlocked! Not sure if this is new or not.' },
      { date: d('2025-11-12'), body: 'Currently locked.' },
    ],
  },
  {
    x: -680, z: 1130, owner: 'Curtis_uwu', shop_name: null, zone: 'Light Blue', status: 'active', is_guild: 0,
    description: 'Selling TNT. Built of TNT and fire, very scary.',
    comments: [
      { date: d('2025-10-06'), body: 'No longer locked and has stock! Still scary.' },
      { date: d('2025-11-12'), body: 'Still runnin, still scary.' },
    ],
  },
  {
    x: -690, z: 1120, owner: 'White_Ouhhang', shop_name: null, zone: 'Light Blue', status: 'locked', is_guild: 0,
    description: 'Personal general shop, locked. Block palette: Quartz with red and gray, like a pokeball.',
    comments: [
      { date: d('2025-10-06'), body: 'Still locked.' },
      { date: d('2025-11-12'), body: 'Still locked.' },
    ],
  },
  {
    x: -690, z: 1110, owner: 'Dumplingsushi', shop_name: null, zone: 'Light Blue', status: 'active', is_guild: 0,
    description: 'Buying all lesser charms, 4 AR per. Block palette: Quartz and light blue glass.',
    comments: [
      { date: d('2025-10-06'), body: 'ssusus (previous occupant): build here but the shop is empty and locked. Block palette: Spruce wood, cyan banners.' },
      { date: d('2025-11-12'), body: 'ssusus\'s old plot replaced by Dumplingsushi.' },
      { date: d('2025-11-12'), body: 'Dumplingsushi: NEW!' },
    ],
  },
  {
    x: -680, z: 1110, owner: 'Pandamonium', shop_name: null, zone: 'Light Blue', status: 'locked', is_guild: 0,
    description: 'The last vestige of "enemy shop," so sad. Hope service. Block carriers. Block palette: Orange, red, and cyan/green.',
    comments: [
      { date: d('2025-10-06'), body: 'Still locked.' },
      { date: d('2025-11-12'), body: 'Still locked.' },
    ],
  },

  // ---------------- ORANGE ----------------
  {
    x: -670, z: 1140, owner: 'Mirnixer1', shop_name: null, zone: 'Orange', status: 'closed', is_guild: 0,
    description: 'Plot is gone as of November 2025. Previously: R1 rares buy/sell, currently locked. Block palette: Spruce.',
    comments: [
      { date: d('2025-10-06'), body: 'Still locked.' },
      { date: d('2025-11-12'), body: 'Gone.' },
    ],
  },
  {
    x: -690, z: 1140, owner: 'zBaconn', shop_name: null, zone: 'Orange', status: 'locked', is_guild: 0,
    description: 'Personal shop, locked. Block palette: Blackstone and black concrete.',
    comments: [
      { date: d('2025-10-06'), body: 'Still locked.' },
      { date: d('2025-11-12'), body: 'Still locked.' },
    ],
  },
  {
    x: -690, z: 1160, owner: 'Num_12345678901', shop_name: null, zone: 'Orange', status: 'active', is_guild: 0,
    description: 'CZ rental sets. Mostly bare plot except for a red sandstone pillar.',
    comments: [
      { date: d('2025-10-06'), body: 'Still running and stocked.' },
      { date: d('2025-11-12'), body: 'Still running, free steak barrel.' },
    ],
  },
  {
    x: -670, z: 1160, owner: 'autumntheace', shop_name: 'Autumn & Deepa\'s Patreon Item Emporium (+Library) (WIP)', zone: 'Orange', status: 'active', is_guild: 0,
    description: 'Block palette: Moss.',
    comments: [
      { date: d('2025-10-06'), body: 'NEW!' },
      { date: d('2025-11-12'), body: 'Currently selling lesser warlock charms, lesser mage charms, Mermaid\'s Touch. New mossy build.' },
    ],
  },
  {
    x: -670, z: 1150, owner: 'carlo_m', shop_name: null, zone: 'Orange', status: 'active', is_guild: 0,
    description: 'My shop! Does your inventory fill up with explosion carriers? Instead of tossing them, bring them here and I\'ll buy them from you! Block palette: Yellow terracotta, yellow candles.',
    comments: [
      { date: d('2025-10-06'), body: 'NEW!' },
      { date: d('2025-11-12'), body: 'Still buying carriers! Feed me! Throw your trash into the black hole of my building collection!' },
    ],
  },

  // ---------------- SHIFTING ----------------
  {
    x: -660, z: 1160, owner: 'RBT_Fireball', shop_name: null, zone: 'Shifting', status: 'unclear', is_guild: 0,
    description: 'Trophy plot for the server\'s first bouquet of gold. Block palette: Warped, oak, birch, nether brick, mud, gold.',
    comments: [
      { date: d('2025-10-06'), body: 'Still here, still aura farming.' },
      { date: d('2025-11-12'), body: 'Aura.' },
    ],
  },
  {
    x: -650, z: 1160, owner: 'B_G_YG', shop_name: null, zone: 'Shifting', status: 'active', is_guild: 0,
    description: 'Lesser and rare charms on sale. R3 potion stonks. Zenith pot stonks and delve pot stonks. Block palette: Quartz, spruce, stone brick.',
    comments: [
      { date: d('2025-10-06'), body: 'Still running and stocked.' },
      { date: d('2025-11-12'), body: 'Still runnin.' },
    ],
  },
  {
    x: -640, z: 1160, owner: 'Vicella', shop_name: null, zone: 'Shifting', status: 'active', is_guild: 0,
    description: 'Market stall build, WIP. Buying 1, 2, 3-star fish, buying sand stickers. Block palette: Oak, red, white.',
    comments: [
      { date: d('2025-10-06'), body: 'NEW! Buying 1, 2, 3-star fish, buying sand stickers.' },
      { date: d('2025-11-12'), body: 'Still buying fish.' },
    ],
  },
  {
    x: -640, z: 1170, owner: 'NetrixC1', shop_name: null, zone: 'Shifting', status: 'locked', is_guild: 0,
    description: 'Police call box. A couple of barrels, all sold out. Personal shop, possibly WIP.',
    comments: [
      { date: d('2025-10-06'), body: 'Currently locked.' },
      { date: d('2025-11-12'), body: 'Still locked.' },
    ],
  },
  {
    x: -650, z: 1180, owner: 'ramiue', shop_name: null, zone: 'Shifting', status: 'active', is_guild: 0,
    description: 'Bag of hoarding, hope skinning. Block palette: Sand and pink umbrella.',
    comments: [
      { date: d('2025-11-12'), body: 'NEW!' },
    ],
  },

  // ---------------- SANCTUM ----------------
  {
    x: -660, z: 1120, owner: 'Jerry_Na', shop_name: null, zone: 'Sanctum', status: 'unclear', is_guild: 0,
    description: 'Garden. Come smell the extremely rare roses.',
    comments: [
      { date: d('2025-10-06'), body: 'Still aura farming.' },
      { date: d('2025-11-12'), body: 'Aura.' },
    ],
  },
  {
    x: -650, z: 1120, owner: 'Moe_Muyo', shop_name: 'HAT', zone: 'Sanctum', status: 'active', is_guild: 0,
    description: 'Free dyed fedoras. Personal general store. Block palette: Warped and mangrove.',
    comments: [
      { date: d('2025-10-06'), body: 'Still got fedoras.' },
      { date: d('2025-11-12'), body: 'Nothin but fedoras.' },
    ],
  },
  {
    x: -640, z: 1120, owner: '_wu_feng_', shop_name: 'UWUWU', zone: 'Sanctum', status: 'active', is_guild: 0,
    description: 'Lots of stonks: R3 rares, season pass artis, shifting artis, frost giants crown, R2/R3 currencies, R3 casino pots. Free zenith charm set rentals. Also has legacies in basement 2. Top Floor: seasonal pass artifacts, tormented fragment, deathly piece of eight, torn canvas, combat scroll, puzzle scroll, diamenean hunt mats, remnant scroll fragment, indigo blighdust, shard of remorse, ticket wheel. Ground Floor: blue/brown/indigo hexfall SKT frags/rares, frost giant\'s crown, star point pelias\' keep wolfswood rares/frags. Basement: sand dollar, R3 casino pots and food, grand prize ticket, zenith charms. Block palette: Black concrete and marble.',
    comments: [
      { date: d('2025-10-06'), body: 'Still open, full stonk list added.' },
      { date: d('2025-11-12'), body: 'Still uwuwuing.' },
    ],
  },
  {
    x: -640, z: 1130, owner: 'NuLL_Inf', shop_name: 'VOID', zone: 'Sanctum', status: 'locked', is_guild: 0,
    description: 'R1/R2 rare stonks, locked. Block palette: Ice, snow, marble, blue.',
    comments: [
      { date: d('2025-10-06'), body: 'Still locked.' },
      { date: d('2025-11-12'), body: 'The build has changed, there\'s an obelisk with maybe a Chinese proverb etched into it. "What do you see in the mirror?"' },
    ],
  },
  {
    x: -640, z: 1140, owner: 'Dinolamaous', shop_name: 'WOOF', zone: 'Sanctum', status: 'locked', is_guild: 0,
    description: 'R3 rares and epics, locked. Block palette: Stone brick, calcite, brown.',
    comments: [
      { date: d('2025-10-06'), body: 'Still locked.' },
      { date: d('2025-11-12'), body: 'Still locked.' },
    ],
  },
  {
    x: -650, z: 1140, owner: 'Shark_YE', shop_name: null, zone: 'Sanctum', status: 'unclear', is_guild: 0,
    description: 'Christmas tree. Signs say 2023/24 gift exchange.',
    comments: [
      { date: d('2025-10-06'), body: 'Still dormant.' },
      { date: d('2025-11-12'), body: 'Thawing I presume.' },
    ],
  },
  {
    x: -660, z: 1140, owner: 'qwqqwqqwqqwqw', shop_name: null, zone: 'Sanctum', status: 'active', is_guild: 0,
    description: 'Personal general shop. Block palette: Stone brick, sea lanterns.',
    comments: [
      { date: d('2025-10-06'), body: 'Open but kinda vacant.' },
      { date: d('2025-11-12'), body: 'Still kinda empty.' },
    ],
  },
  {
    x: -660, z: 1130, owner: 'TheJinzou', shop_name: null, zone: 'Sanctum', status: 'active', is_guild: 0,
    description: 'Individual charm rental service. Lesser charms for sale. Block palette: Jungle wood, yellow, black wool.',
    comments: [
      { date: d('2025-10-06'), body: 'Still running!' },
      { date: d('2025-11-12'), body: 'Still running and dressed up for Halloween. Nobody else decorated for Halloween! Good job TheJinzou!' },
    ],
  },

  // ---------------- TEAL ----------------
  {
    x: -600, z: 1080, owner: 'michthemoo', shop_name: 'NYAA', zone: 'Teal', status: 'active', is_guild: 0,
    description: '"Everything in R3" gear rental shop, by the piece not by the set. Block palette: Crimson wood, deep slate, pink, gray.',
    comments: [
      { date: d('2025-10-06'), body: 'Still running!' },
      { date: d('2025-11-12'), body: 'Still running.' },
    ],
  },
  {
    x: -600, z: 1070, owner: 'gasp97', shop_name: 'Vanity Shop', zone: 'Teal', status: 'active', is_guild: 0,
    description: 'Large gear collection for vanity sets.',
    comments: [
      { date: d('2025-10-06'), body: 'Still running!' },
      { date: d('2025-11-12'), body: 'Still running!' },
    ],
  },
  {
    x: -600, z: 1060, owner: 'Hanjizen', shop_name: null, zone: 'Teal', status: 'closed', is_guild: 0,
    description: 'Charm rental. Closed on purpose — locked, with a sign that says closed.',
    comments: [
      { date: d('2025-10-06'), body: 'Still closed.' },
      { date: d('2025-11-12'), body: 'Still closed.' },
    ],
  },
  {
    x: -590, z: 1060, owner: 'TrainerEevee', shop_name: null, zone: 'Teal', status: 'closed', is_guild: 0,
    description: 'Instant Infusion XP Service. R3 rare exchange. Block palette: Dark oak, spruce, green.',
    comments: [
      { date: d('2025-10-06'), body: 'Still running.' },
      { date: d('2025-11-12'), body: 'Defunct? Services are gone!' },
    ],
  },
  {
    x: -580, z: 1060, owner: 'Heleith', shop_name: null, zone: 'Teal', status: 'unclear', is_guild: 0,
    description: '"Modify this shop plot however you\'d like!" Right now it\'s a black concrete box with amethyst on top.',
    comments: [
      { date: d('2025-10-06'), body: 'Still just a big concrete box.' },
      { date: d('2025-11-12'), body: 'Someone rigged redstone to shoot an arrow at a nearby bell when you press a nearby button. Really clever, kudos to whoever built it.' },
    ],
  },
  {
    x: -580, z: 1070, owner: 'CS_Aristotle', shop_name: 'Library of Arisandria', zone: 'Teal', status: 'active', is_guild: 0,
    description: 'Lore book library. Block palette: Quartz and bookshelves.',
    comments: [
      { date: d('2025-10-06'), body: 'Still open.' },
      { date: d('2025-11-12'), body: 'Still open.' },
    ],
  },

  // ---------------- YELLOW ----------------
  {
    x: -600, z: 1100, owner: 'Laapsap', shop_name: null, zone: 'Yellow', status: 'active', is_guild: 0,
    description: 'Patron items for sale and rent. Block palette: Pink and yellow stained clay.',
    comments: [
      { date: d('2025-10-06'), body: 'Still open.' },
      { date: d('2025-11-12'), body: 'Inventory running out, but patron items still for sale: Colored Fire, Skyfeller, Bramble Blaster, Tome of the Pretsell, Pragmatism, B.O.N.K. Rental basement has almost all R1/R2 patron items.' },
    ],
  },
  {
    x: -580, z: 1090, owner: 'excellentbear', shop_name: 'IRS Infusion Service', zone: 'Yellow', status: 'closed', is_guild: 0,
    description: 'Defunct? Moved to guild shop. Block palette: Gold and lapis blocks.',
    comments: [
      { date: d('2025-10-06'), body: 'Still defunct.' },
      { date: d('2025-11-12'), body: 'Still defunct.' },
    ],
  },
  {
    x: -580, z: 1100, owner: 'MCJAWang2007', shop_name: 'IRS Rare Exchange', zone: 'Yellow', status: 'closed', is_guild: 0,
    description: 'WIP or defunct, not sure. Block palette: Gold and lapis blocks.',
    comments: [
      { date: d('2025-10-06'), body: 'Still defunct.' },
      { date: d('2025-11-12'), body: 'Still defunct.' },
    ],
  },
  {
    x: -590, z: 1110, owner: 'Lemon1011', shop_name: null, zone: 'Yellow', status: 'active', is_guild: 0,
    description: 'Mail and auction services. Infusion service. Block palette: Spruce wood.',
    comments: [
      { date: d('2025-10-06'), body: 'Still running.' },
      { date: d('2025-11-12'), body: 'Still running.' },
    ],
  },
  {
    x: -600, z: 1110, owner: 'fumoa', shop_name: null, zone: 'Yellow', status: 'unclear', is_guild: 0,
    description: 'Plot for Harry_Cake\'s "3rd unofficial architect\'s ring anniversary giveaway," final entry date 10/28/2025. Block palette: Spruce and jungle leaves.',
    comments: [
      { date: d('2025-10-06'), body: 'NEW!' },
      { date: d('2025-11-12'), body: 'Dormant now.' },
    ],
  },
  {
    x: -600, z: 1090, owner: 'Sw_Fox', shop_name: null, zone: 'Yellow', status: 'active', is_guild: 0,
    description: 'R1, R2 rare stonks. WTS sea daffodils. Block palette: White glass and snow.',
    comments: [
      { date: d('2025-10-06'), body: 'NEW!' },
      { date: d('2025-11-12'), body: 'Still running.' },
    ],
  },
  {
    x: -590, z: 1090, owner: 'Leolu666', shop_name: null, zone: 'Yellow', status: 'active', is_guild: 0,
    description: 'Selling R2 rares, R3 rares, Pulsing Orb, Quickening Mycosis, Forum Mats Binah Leaf. Narsen\'s Will for rent. Block palette: White glass, barrels, and a very nice doorbell.',
    comments: [
      { date: d('2025-10-06'), body: 'NEW!' },
      { date: d('2025-11-12'), body: 'Doorbell is even more intricate.' },
    ],
  },

  // ---------------- REVERIE ----------------
  {
    x: -620, z: 1130, owner: 'StupefiedSteve', shop_name: null, zone: 'Reverie', status: 'active', is_guild: 0,
    description: '5* fish exchange, free. Portable cornifer trades. Some other fish trades. Some zenith rares for sale. Block palette: Quartz basement, mostly bare on top.',
    comments: [
      { date: d('2025-10-06'), body: 'Still here.' },
      { date: d('2025-11-12'), body: 'Still here with lots of zenith rares.' },
    ],
  },
  {
    x: -630, z: 1130, owner: 'Pontosaurus', shop_name: null, zone: 'Reverie', status: 'unclear', is_guild: 0,
    description: 'Empty plot.',
    comments: [
      { date: d('2025-10-06'), body: 'TrueZoomer (previous occupant): zenith charm stonks, all blackstone/black glass build. Locked, under renovation?' },
      { date: d('2025-11-12'), body: 'TrueZoomer\'s old plot replaced with Pontosaurus.' },
      { date: d('2025-11-12'), body: 'Pontosaurus: empty plot.' },
    ],
  },
  {
    x: -630, z: 1120, owner: 'Honeypint', shop_name: null, zone: 'Reverie', status: 'active', is_guild: 0,
    description: 'WTB strike trophies. Block palette: Stonkco blocks, stone bricks, oak.',
    comments: [
      { date: d('2025-10-06'), body: 'Still running.' },
      { date: d('2025-11-12'), body: 'Still buying strike trophies.' },
    ],
  },
  {
    x: -630, z: 1110, owner: 'ztw0_0', shop_name: null, zone: 'Reverie', status: 'active', is_guild: 0,
    description: 'Great collection of R1 and R2 items for rent, cheap. Some R2 teal rares for sale too. Block palette: Barrels, stone bricks, sandstone.',
    comments: [
      { date: d('2025-10-06'), body: 'Still running.' },
      { date: d('2025-11-12'), body: 'Still running, huge collection, great for vanity.' },
    ],
  },
  {
    x: -620, z: 1110, owner: 'CheesePusheen', shop_name: null, zone: 'Reverie', status: 'unclear', is_guild: 0,
    description: 'Personal general shop, mostly WIP. Block palette: Just barrels and stone bricks.',
    comments: [
      { date: d('2025-10-06'), body: 'Currently has p-gold and p-emerald stonks.' },
      { date: d('2025-11-12'), body: 'Empty except for a vanity chest, not sure if it\'s rental or has other rules.' },
    ],
  },
  {
    x: -610, z: 1110, owner: 'Mine_Hinata', shop_name: null, zone: 'Reverie', status: 'unclear', is_guild: 0,
    description: 'Some misc stonks, mostly WIP. Block palette: Dark oak, blackstone, spruce, leaves.',
    comments: [
      { date: d('2025-10-06'), body: 'Taxless anvil, shulker, and lockbox stonks in basement.' },
      { date: d('2025-11-12'), body: 'Same few stonks, mostly WIP.' },
    ],
  },
  {
    x: -610, z: 1120, owner: 'Harry_Cake', shop_name: null, zone: 'Reverie', status: 'active', is_guild: 0,
    description: 'R123 rares and arti trader services. Free cakes. Same aesthetic as AirFloat nearby.',
    comments: [
      { date: d('2025-10-06'), body: 'Still running. Per HuiyingZz: "cake shop is for NPC trader service, in case anyone wants an item whose buy doesn\'t have the trade unlocked or is difficult to access."' },
      { date: d('2025-11-12'), body: 'Still runnin.' },
    ],
  },
  {
    x: -610, z: 1130, owner: 'AirFloat', shop_name: null, zone: 'Reverie', status: 'active', is_guild: 0,
    description: 'Charm shop. Remnants of a giveaway. Managed by Harry_Cake, same aesthetic as that shop. Per HuiyingZz: for lesser charm upgrading.',
    comments: [
      { date: d('2025-10-06'), body: 'Still running.' },
      { date: d('2025-11-12'), body: 'Still runnin.' },
    ],
  },

  // ---------------- GRAY ----------------
  {
    x: -630, z: 1160, owner: 'Abtruse', shop_name: null, zone: 'Gray', status: 'active', is_guild: 0,
    description: 'R1/R2 patron item ordering service. Catalog with prices for each item. Block palette: Quartz and white glass.',
    comments: [
      { date: d('2025-10-06'), body: 'Currently locked.' },
      { date: d('2025-11-12'), body: 'No longer locked, runnin.' },
    ],
  },
  {
    x: -610, z: 1150, owner: null, shop_name: null, zone: 'Gray', status: 'unclear', is_guild: 0,
    description: 'Previously altephcomputer2\'s shop (R123 rares stonks, epic/utility rentals). Owner moved to -630, 1140 as of the November 2025 update.',
    comments: [
      { date: d('2025-10-06'), body: 'altephcomputer2: still running, renting out chains of entropy, mountain\'s dew, mouth of the mimic, chimera\'s grace, doorway from eternity, primordial flames, malakut\'s scorn, free epic rentals.' },
      { date: d('2025-11-12'), body: 'altephcomputer2 moved to a slightly better plot at -630, 1140.' },
    ],
  },
  {
    x: -630, z: 1140, owner: 'altephcomputer2', shop_name: null, zone: 'Gray', status: 'unclear', is_guild: 0,
    description: 'Moved here from -610, 1150. R123 rares stonks (WIP after the move). Epics and utility items for rent, free. R1 lootrun set for rent, free. Arrows, various artis, azacor uncommons for sale in basement. Block palette: Bare stone brick and barrel.',
    comments: [
      { date: d('2025-10-06'), body: 'Vocracity (previous occupant): personal shop with various items of the week and rotating stock. Selling phasing chestplate, earthbound talisman, crest of the tundra, tormented fragment, fish bait. "Go to OPM shop, I have moved the best stonks there."' },
      { date: d('2025-11-12'), body: 'Vocracity\'s old plot replaced by altephcomputer2, who moved over from -610, 1150. Maybe some new epics in here.' },
    ],
  },
  {
    x: -620, z: 1140, owner: 'TKW256', shop_name: null, zone: 'Gray', status: 'unclear', is_guild: 0,
    description: 'R1 rental set. Arrows by the stack. Dye, beds. Block palette: Pink wool, pink glass.',
    comments: [
      { date: d('2025-10-06'), body: 'Currently locked.' },
      { date: d('2025-11-12'), body: 'Stock is a little low, currently have arrows stocked and a few R3 items: Stargazer\'s Revelation, Treads of the Hungerer, Effulgent Fragment, Crimson Tithe.' },
    ],
  },
  {
    x: -610, z: 1140, owner: 'Velis_Bluedron', shop_name: 'Heavenly Area', zone: 'Gray', status: 'locked', is_guild: 0,
    description: 'EC artis and discs. Locked, so hard to tell what else is here. Block palette: Quartz and magma blocks.',
    comments: [
      { date: d('2025-10-06'), body: 'Still locked.' },
      { date: d('2025-11-12'), body: 'Still locked.' },
    ],
  },
  {
    x: -610, z: 1160, owner: 'Shadowstep130_', shop_name: null, zone: 'Gray', status: 'closed', is_guild: 0,
    description: 'Plot closed as of November 2025. Previously: R1/R2 gear, food, potions for sale; WTB health potions and R1/R2 rares. Block palette: Quartz, black and red concrete.',
    comments: [
      { date: d('2025-10-06'), body: 'Currently locked.' },
      { date: d('2025-11-12'), body: 'Closed.' },
    ],
  },

  // ---------------- NORTHERN GUILD PLOTS ----------------
  {
    x: -640, z: 1050, owner: '[Rend] Renegades', shop_name: null, zone: 'Northern Guild Plots', status: 'active', is_guild: 1,
    description: 'Gray/brown/green text, lime green tag. "NEW Syrup Exchange." R1/R2 rares and artis for sale in basement. Piano out front.',
    comments: [
      { date: d('2025-10-06'), body: 'Currently locked.' },
      { date: d('2025-11-12'), body: 'Unlocked, still got syrup!' },
    ],
  },
  {
    x: -660, z: 1050, owner: '[WOOL] Woolbearers', shop_name: null, zone: 'Northern Guild Plots', status: 'unclear', is_guild: 1,
    description: 'Sandstone, dark gray tag. WIP.',
    comments: [
      { date: d('2025-10-06'), body: 'Still WIP but there\'s a nice build here now.' },
      { date: d('2025-11-12'), body: 'Still not ready to open.' },
    ],
  },
  {
    x: -660, z: 1030, owner: '[NDH] No Drags Here', shop_name: null, zone: 'Northern Guild Plots', status: 'locked', is_guild: 1,
    description: 'Spruce, deepslate, dark purple tag. Vanity shop, not yet open.',
    comments: [
      { date: d('2025-10-06'), body: '[FPF] Fish Release Friday (previous occupant): gone! Plot given to NDH.' },
      { date: d('2025-10-06'), body: '[NDH] No Drags Here: NEW! Vanity shop, not yet open.' },
      { date: d('2025-11-12'), body: 'Not yet open, locked.' },
    ],
  },
  {
    x: -640, z: 1030, owner: '[Smoke] big smoke 100', shop_name: null, zone: 'Northern Guild Plots', status: 'active', is_guild: 1,
    description: 'R3 mat stonks. Guild member bazaar. Block palette: Quartz, amethyst, moss, orange guild tag.',
    comments: [
      { date: d('2025-10-06'), body: 'Still running.' },
      { date: d('2025-11-12'), body: 'Still runnin, stocked with mats.' },
    ],
  },

  // ---------------- SOUTHERN GUILD PLOTS ----------------
  {
    x: -660, z: 1090, owner: '[LxT] Solis Crudelia', shop_name: null, zone: 'Southern Guild Plots', status: 'active', is_guild: 1,
    description: 'Purple nametag, deep slate and warped signs. Lesser charms WTS. CZ rares WTS. Delve epics for 80% NPC price. Auction wall. 5* fish exchange with 24ar fee. R3 rate exchange with 12ar fee.',
    comments: [
      { date: d('2025-10-06'), body: 'Still running.' },
      { date: d('2025-11-12'), body: 'Still running.' },
    ],
  },
  {
    x: -640, z: 1090, owner: '[MAID] Maids of Monumenta', shop_name: null, zone: 'Southern Guild Plots', status: 'active', is_guild: 1,
    description: 'Light gray nametag, purple/white/black build aesthetic. Buy/sell R1/R2 rares. 5* fish exchange. Lesser charms for sale. Guild member bazaar.',
    comments: [
      { date: d('2025-10-06'), body: 'Still runnin.' },
      { date: d('2025-11-12'), body: 'First floor has been gutted, but everything listed above is still in service.' },
    ],
  },
  {
    x: -640, z: 1110, owner: '[HVN] Haven', shop_name: null, zone: 'Southern Guild Plots', status: 'active', is_guild: 1,
    description: 'Elusive blue nametag, stone structure with pond around it. Blocks, fishing bait, gold and iron ingots for sale. Free food barrels. "Charm Evaluation Emporium" service.',
    comments: [
      { date: d('2025-10-06'), body: 'Still runnin.' },
      { date: d('2025-11-12'), body: 'Still runnin.' },
    ],
  },
  {
    x: -660, z: 1110, owner: '[ZR] Zenkor Reborn', shop_name: null, zone: 'Southern Guild Plots', status: 'active', is_guild: 1,
    description: 'Pink/magenta nametag, Squidnee (blue terracotta). Hexed item collection for vanity skins. R3 rares, 2har each. Lesser charms for sale. Various R3 exchanges. Free food barrel. Hexfall loadouts for rent (gear, charms, even yellow tess for skill loadout). New and endgame items for rent.',
    comments: [
      { date: d('2025-10-06'), body: 'Still runnin, now has the new R3 POI rares for rent.' },
      { date: d('2025-11-12'), body: 'New season pass arti (Sheol), rush artis (Mask of Cacophony, Rose Touch, Scarlet Shift, Void Heart), and spirit archery artis (Lacrimosa, Wanderer\'s Wick, The Kindling Steps, Speaker\'s Ward) available for rental.' },
    ],
  },

  // ---------------- EASTERN GUILD PLOTS ----------------
  {
    x: -630, z: 1040, owner: '[FISH] The Aquarium', shop_name: null, zone: 'Eastern Guild Plots', status: 'active', is_guild: 1,
    description: 'Blue tag. Blocks of all kinds.',
    comments: [
      { date: d('2025-10-06'), body: 'New, WTB iron ore and emerald blocks.' },
      { date: d('2025-11-12'), body: 'Refurbished! Brand new build! Blocks restocked! Now buying certain rare blocks on the top floor.' },
    ],
  },
  {
    x: -630, z: 1060, owner: '[TCL] Stonkco', shop_name: null, zone: 'Eastern Guild Plots', status: 'active', is_guild: 1,
    description: 'Stonkco',
    comments: [
      { date: d('2025-10-06'), body: 'Still stonkin.' },
      { date: d('2025-11-12'), body: 'Still stonkin!' },
    ],
  },
  {
    x: -630, z: 1080, owner: '[FORCE] Dark Force Rising', shop_name: null, zone: 'Eastern Guild Plots', status: 'active', is_guild: 1,
    description: 'Rouge/dark pinkish tag, dark oak, andesite, nether brick. Member barrel bazaar. R2/R3 pot stonks. R3 rare stonks. Other niche utility stonks like VR keys, GPT, lockboxes.',
    comments: [
      { date: d('2025-10-06'), body: 'Still runnin (one of the big guild shops that sells everything).' },
      { date: d('2025-11-12'), body: 'Yeah, still runnin.' },
    ],
  },
  {
    x: -630, z: 1100, owner: '[EDE] Grand', shop_name: null, zone: 'Eastern Guild Plots', status: 'active', is_guild: 1,
    description: 'Super light pink tag, snow blocks. Member barrel bazaar. Various R123 rares. R2 rogue set rental.',
    comments: [
      { date: d('2025-10-06'), body: 'Still runnin.' },
      { date: d('2025-11-12'), body: 'Still runnin!' },
    ],
  },

  // ---------------- EAST ROW 2 ----------------
  {
    x: -610, z: 1040, owner: '[VEIL] Scholars of the Veil', shop_name: null, zone: 'East Row 2', status: 'active', is_guild: 1,
    description: 'Light pink tag, deep slate. Member barrel bazaar. T5 fish exchange, 1 per person per day. T4 fish for sale. R2 rares, various shifting city items in basement.',
    comments: [
      { date: d('2025-10-06'), body: 'NOW OPEN! NEW!' },
      { date: d('2025-11-12'), body: 'Still runnin!' },
    ],
  },
  {
    x: -610, z: 1060, owner: '[AEUGH] Pufferfish', shop_name: null, zone: 'East Row 2', status: 'active', is_guild: 1,
    description: 'Yellow tag, yellow and blue blocks. Lesser charms. Misc stonks.',
    comments: [
      { date: d('2025-10-06'), body: 'No longer locked! Also a new WTB diamenean hunt boss mats barrel.' },
      { date: d('2025-11-12'), body: 'Still runnin.' },
    ],
  },
  {
    x: -610, z: 1080, owner: '[NYAA] Little Nyas', shop_name: null, zone: 'East Row 2', status: 'unclear', is_guild: 1,
    description: 'Light pink tag, spruce build. Utility items like anvils, torches, food, arrows, potions (stock is mostly empty). R1/R2 rares in basement. Portable keloch, jean bay, infusion master in basement.',
    comments: [
      { date: d('2025-10-06'), body: 'Still runnin.' },
      { date: d('2025-11-12'), body: 'Kinda cleaned out, but basement still has some stock.' },
    ],
  },
  {
    x: -610, z: 1100, owner: '[PIG] GG Bond', shop_name: null, zone: 'East Row 2', status: 'active', is_guild: 1,
    description: 'Light pink tag, cherry pink build. R3 rares and currencies stonks. R3 set rentals. R3 pot stonk. R2/R1 utility stonks. R123 mats stonks and rare frag stonks, more stonks than can fit on a sign.',
    comments: [
      { date: d('2025-10-06'), body: 'Still stonkin.' },
      { date: d('2025-11-12'), body: 'Maybe even more rental sets now, some stonks have moved around.' },
    ],
  },

  // ---------------- WESTERN GUILD PLOTS ----------------
  {
    x: -670, z: 1100, owner: '[OpM] Opus Maximus', shop_name: null, zone: 'Western Guild Plots', status: 'locked', is_guild: 1,
    description: 'Light purple tag. Plot building service. Gear rentals. Member barrel bazaar.',
    comments: [
      { date: d('2025-10-06'), body: 'New free pottery rental barrel on ground floor.' },
      { date: d('2025-11-12'), body: 'Locked!' },
    ],
  },
  {
    x: -670, z: 1080, owner: '[Miku] Miku Fan Club', shop_name: null, zone: 'Western Guild Plots', status: 'active', is_guild: 1,
    description: 'Cyan/light blue tag. Lesser charms. R123 rental sets and rental charms.',
    comments: [
      { date: d('2025-10-06'), body: 'Still runnin, some new rentals maybe.' },
      { date: d('2025-11-12'), body: 'Still runnin, some WIP barrels on ground floor.' },
    ],
  },
  {
    x: -670, z: 1060, owner: '[VH] Vault Hunter', shop_name: null, zone: 'Western Guild Plots', status: 'active', is_guild: 1,
    description: 'Black tag. Food, arrows, anvils, shulkers, potions, blocks. R123 rares and tiered gear for sale; possibly the only shop in the whole market that sells tiered gear.',
    comments: [
      { date: d('2025-10-06'), body: 'Still runnin, and yes, this seems to be the only shop with tiered gear.' },
      { date: d('2025-11-12'), body: 'Still runnin.' },
    ],
  },
  {
    x: -670, z: 1040, owner: '[Skadi] Aegir', shop_name: null, zone: 'Western Guild Plots', status: 'active', is_guild: 1,
    description: 'Light blue tag. R3 rental sets. Charms.',
    comments: [
      { date: d('2025-10-06'), body: 'Still runnin.' },
      { date: d('2025-11-12'), body: 'Nothing\'s changed, still runnin.' },
    ],
  },

  // ---------------- WEST ROW 2 ----------------
  {
    x: -690, z: 1100, owner: '[-w-zZ] No Gamble No Life', shop_name: null, zone: 'West Row 2', status: 'active', is_guild: 1,
    description: 'Dark magenta tag. 5* fish exchange. Member bazaar barrels. Sand sticker and shattered gem stonks. Also selling zenith, hexfall, godspore, portal, marina noir, masquerades ruin, sanguine halls, and R3 transmogrifier rares in basement level 1.',
    comments: [
      { date: d('2025-10-06'), body: 'Still runnin, now selling the expanded rare list.' },
      { date: d('2025-11-12'), body: 'Still runnin.' },
    ],
  },
  {
    x: -690, z: 1080, owner: '[HTT] HOKAGO TEA TIME', shop_name: null, zone: 'West Row 2', status: 'locked', is_guild: 1,
    description: 'Light pink tag. 5* fish sell/trade. R23 rares and charms. Carnival wheels. EC pots and artis.',
    comments: [
      { date: d('2025-10-06'), body: 'No longer locked! Selling R2 rares.' },
      { date: d('2025-11-12'), body: 'Locked!' },
    ],
  },
  {
    x: -690, z: 1060, owner: '[DAY] Daybreak', shop_name: null, zone: 'West Row 2', status: 'active', is_guild: 1,
    description: 'Dark purple tag. Potions and blocks for sale. Speedrun set and other sets for rent. Free food barrel.',
    comments: [
      { date: d('2025-10-06'), body: 'Still running, selling TNT and blocks in the basement, might be new.' },
      { date: d('2025-11-12'), body: 'Still runnin.' },
    ],
  },
  {
    x: -690, z: 1040, owner: '[IRS] Incredible Raccoon Squadron', shop_name: null, zone: 'West Row 2', status: 'closed', is_guild: 1,
    description: 'Blue tag. Seemingly WIP.',
    comments: [
      { date: d('2025-10-06'), body: 'Still closed.' },
      { date: d('2025-11-12'), body: 'Still defunct.' },
    ],
  },
];

function run() {
  db.exec('DELETE FROM comments; DELETE FROM images; DELETE FROM reports; DELETE FROM plots;');

  const insertPlot = db.prepare(`
    INSERT INTO plots (x, z, owner, shop_name, zone, status, description, is_guild, updated_at)
    VALUES (@x, @z, @owner, @shop_name, @zone, @status, @description, @is_guild, @updated_at)
  `);
  const insertComment = db.prepare(`
    INSERT INTO comments (plot_x, plot_z, author, body, is_system, status, created_at)
    VALUES (@plot_x, @plot_z, @author, @body, 0, 'approved', @created_at)
  `);

  const seedAll = db.transaction(() => {
    for (const p of plots) {
      insertPlot.run({
        x: p.x,
        z: p.z,
        owner: p.owner,
        shop_name: p.shop_name,
        zone: p.zone,
        status: p.status,
        description: p.description,
        is_guild: p.is_guild,
        updated_at: new Date().toISOString(),
      });
      for (const c of p.comments) {
        insertComment.run({
          plot_x: p.x,
          plot_z: p.z,
          author: AUTHOR,
          body: c.body,
          created_at: c.date,
        });
      }
    }
  });

  seedAll();
  console.log(`Seeded ${plots.length} plots.`);
}

run();
