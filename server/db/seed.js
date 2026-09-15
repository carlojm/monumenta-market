import db from './init.js';

const plots = [
  {
    x: -640, z: 960,
    owner: 'HuiyingZz', shop_name: null, zone: 'Lime',
    status: 'active',
    description: 'Mainly a CZ Charm set rental shop, also has some gear for rent: Hrimnir\'s Frosted Eye, Bouquet of Gold, Myrahg\'s Pestilence. Pickaxe rentals: Pureshard Adze 4*, Gem-Tipped Boilerdrill 4*, The Overclocker 4*, Supernova Mattock 4*. Gearset rentals: R3 proj set, R3 caster set. Block palette: Blackstone.',
    is_guild: 0,
  },
  {
    x: -650, z: 960,
    owner: '_FoxArctic_', shop_name: null, zone: 'Lime',
    status: 'active',
    description: 'R3 stonks: legendary charm, epic charm, rare charms, colossal cognac, terrestrial sinew uamiel mat, experience stash, consuming elixir, greater experience stash. Potion carrier stonks: carrier of Lucky Starbrew, carrier of Wolfswood\'s Fury. R1 lootrun set rental. Rush of dissonance tenebrist rental set. Free chorus fruit. Block palette: Oak and glass.',
    is_guild: 0,
  },
  {
    x: -660, z: 1020,
    owner: 'HermitMonk', shop_name: 'HermitMonk\'s Market Directory', zone: 'Magenta',
    status: 'active',
    description: 'The original market directory this site is based on.',
    is_guild: 0,
  },
];

const insertPlot = db.prepare(`
  INSERT OR REPLACE INTO plots (x, z, owner, shop_name, zone, status, description, is_guild, updated_at)
  VALUES (@x, @z, @owner, @shop_name, @zone, @status, @description, @is_guild, @updated_at)
`);

const now = new Date().toISOString();

for (const plot of plots) {
  insertPlot.run({ ...plot, updated_at: now });
}

console.log(`Seeded ${plots.length} plots.`);