export const DIR_N = 1;
export const DIR_E = 2;
export const DIR_S = 3;
export const DIR_W = 4;
export const DIR_UP = 5;
export const DIR_DOWN = 6;

export function packCoord(level: number, x: number, y: number): number {
  return level * 10000 + y * 100 + x;
}

export function unpackCoord(coord: number): { level: number; x: number; y: number } {
  const level = Math.floor(coord / 10000);
  const rem = coord % 10000;
  return { level, x: rem % 100, y: Math.floor(rem / 100) };
}

/** Coordinate one step in `dir` from (level,x,y). N: y-1, S: y+1, E: x+1, W: x-1, Up/Down: level∓1. */
export function targetCoord(dir: number, level: number, x: number, y: number): number {
  switch (dir) {
    case DIR_N: return packCoord(level, x, y - 1);
    case DIR_E: return packCoord(level, x + 1, y);
    case DIR_S: return packCoord(level, x, y + 1);
    case DIR_W: return packCoord(level, x - 1, y);
    case DIR_UP: return packCoord(level - 1, x, y);
    case DIR_DOWN: return packCoord(level + 1, x, y);
    default: return packCoord(level, x, y);
  }
}
