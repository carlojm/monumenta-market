// market_map.png is 224 x 256 at 1 pixel per block. Its top-left pixel is
// in-game x -768, z 944 (north is up, so z grows downward).
const ORIGIN = { x: -768, z: 944 };
const IMG_WIDTH = 224;
const IMG_HEIGHT = 256;

// Plot sizes in blocks, measured from the map image.
export const PLOT_SIZE = 8;
export const GUILD_PLOT_SIZE = 13;

// Guild squares line up better drawn one block up and left of their recorded
// NW corner
const GUILD_DRAW_OFFSET = -1;

// Position and size of a plot (x, z = its NW corner) as CSS percentages
// of the map image.
export function plotRect(x, z, isGuild) {
  const size = isGuild ? GUILD_PLOT_SIZE : PLOT_SIZE;
  const offset = isGuild ? GUILD_DRAW_OFFSET : 0;
  return {
    left: `${((x + offset - ORIGIN.x) / IMG_WIDTH) * 100}%`,
    top: `${((z + offset - ORIGIN.z) / IMG_HEIGHT) * 100}%`,
    width: `${(size / IMG_WIDTH) * 100}%`,
    height: `${(size / IMG_HEIGHT) * 100}%`,
  };
}
