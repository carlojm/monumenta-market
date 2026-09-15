// Calibration: map two known in-game coordinate points to their pixel
// positions on market_map.png (224 x 256). Update these once you've
// identified two reliable reference plots on the image.
const CALIBRATION = {
  pointA: { gameX: -768, gameZ: 944, pixelX: 1, pixelY: 1 },
  pointB: { gameX: -545, gameZ: 1199, pixelX: 224, pixelY: 256 },
};

const { pointA: A, pointB: B } = CALIBRATION;

const scaleX = (B.pixelX - A.pixelX) / (B.gameX - A.gameX);
const scaleY = (B.pixelY - A.pixelY) / (B.gameZ - A.gameZ);

const IMG_WIDTH = 223;
const IMG_HEIGHT = 254;

// Converts in-game x/z to a percentage position on the map image,
// suitable for CSS `left`/`top` on an absolutely positioned overlay.
export function gameToPercent(gameX, gameZ) {
  const pixelX = A.pixelX + (gameX - A.gameX) * scaleX;
  const pixelY = A.pixelY + (gameZ - A.gameZ) * scaleY;

  return {
    left: `${(pixelX / IMG_WIDTH) * 100}%`,
    top: `${(pixelY / IMG_HEIGHT) * 100}%`,
  };
}