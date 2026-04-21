import {
  TILE_SIZE,
  WORLD_COLUMNS,
  WORLD_ROWS,
  WORLD_SIZE,
} from "@/lib/world/constants";
import type { Size } from "@/lib/world/types";

const GRASS_VARIANT_PATHS = [
  "/resources/grass-1.svg",
  "/resources/grass-2.svg",
  "/resources/grass-3.svg",
] as const;
const OCEAN_PATH = "/resources/ocean.svg";
const ROAD_STRAIGHT_PATH = "/resources/road-straight.svg";

export const ROAD_LENGTH = 5;
export const ROAD_ROW = Math.floor((WORLD_ROWS - 1) / 2);
export const ROAD_START_COL = WORLD_COLUMNS - ROAD_LENGTH;

export type TerrainSprites = {
  grassVariants: HTMLImageElement[];
  ocean: HTMLImageElement;
  roadStraight: HTMLImageElement;
};

type TerrainCache = {
  sprites: TerrainSprites | null;
  spritesPromise: Promise<TerrainSprites> | null;
  tileVariants: Uint8Array;
};

const terrainCache = getTerrainCache();

export function getGrassVariantForTile(col: number, row: number) {
  return terrainCache.tileVariants[row * WORLD_COLUMNS + col] ?? 0;
}

export function isRoadTile(col: number, row: number) {
  return row === ROAD_ROW && col >= ROAD_START_COL && col < WORLD_COLUMNS;
}

export function isOceanTile(col: number, row: number) {
  return (
    row === 0 ||
    row === WORLD_ROWS - 1 ||
    col === 0 ||
    col === WORLD_COLUMNS - 1
  );
}

export function loadTerrainSprites() {
  if (terrainCache.sprites !== null) {
    return Promise.resolve(terrainCache.sprites);
  }

  if (terrainCache.spritesPromise !== null) {
    return terrainCache.spritesPromise;
  }

  terrainCache.spritesPromise = Promise.all([
    Promise.all(GRASS_VARIANT_PATHS.map((path) => loadImage(path))),
    loadImage(OCEAN_PATH),
    loadImage(ROAD_STRAIGHT_PATH),
  ])
    .then(([grassVariants, ocean, roadStraight]) => {
      terrainCache.sprites = {
        grassVariants,
        ocean,
        roadStraight,
      };
      terrainCache.spritesPromise = null;
      return terrainCache.sprites;
    })
    .catch((error: unknown) => {
      terrainCache.spritesPromise = null;
      throw error;
    });

  return terrainCache.spritesPromise;
}

export function getRoadFocusWorldPosition() {
  return {
    x: ROAD_START_COL * TILE_SIZE + (ROAD_LENGTH * TILE_SIZE) / 2,
    y: ROAD_ROW * TILE_SIZE + TILE_SIZE / 2,
  };
}

export function getInitialRoadFocusZoom(viewport: Size) {
  const focus = getRoadFocusWorldPosition();
  const horizontalRoom = Math.max(
    1,
    Math.min(focus.x, WORLD_SIZE - focus.x) * 2,
  );
  const verticalRoom = Math.max(
    1,
    Math.min(focus.y, WORLD_SIZE - focus.y) * 2,
  );

  return Math.max(
    viewport.width / horizontalRoom,
    viewport.height / verticalRoom,
  );
}

function getTerrainCache(): TerrainCache {
  const globalCache = globalThis as typeof globalThis & {
    __townhallTerrainCache__?: TerrainCache;
  };

  if (globalCache.__townhallTerrainCache__ !== undefined) {
    return globalCache.__townhallTerrainCache__;
  }

  const cache: TerrainCache = {
    sprites: null,
    spritesPromise: null,
    tileVariants: createTileVariants(),
  };

  globalCache.__townhallTerrainCache__ = cache;
  return cache;
}

function createTileVariants() {
  const variants = new Uint8Array(WORLD_COLUMNS * WORLD_ROWS);

  for (let index = 0; index < variants.length; index += 1) {
    variants[index] = Math.floor(Math.random() * GRASS_VARIANT_PATHS.length);
  }

  return variants;
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => {
      reject(new Error(`Failed to load image: ${src}`));
    };
    image.src = src;
  });
}
