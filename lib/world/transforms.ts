import {
  BASE_MAX_ZOOM,
  TILE_SIZE,
  WORLD_COLUMNS,
  WORLD_ROWS,
  WORLD_SIZE,
} from "@/lib/world/constants";
import type {
  CameraState,
  Size,
  TileCoord,
  Vec2,
  VisibleTileBounds,
} from "@/lib/world/types";

export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function getZoomLimits(viewport: Size) {
  const safeWidth = Math.max(viewport.width, 1);
  const safeHeight = Math.max(viewport.height, 1);
  const min = Math.max(safeWidth / WORLD_SIZE, safeHeight / WORLD_SIZE);

  return {
    min,
    max: Math.max(BASE_MAX_ZOOM, min),
  };
}

export function clampZoom(zoom: number, viewport: Size) {
  const { min, max } = getZoomLimits(viewport);
  return clamp(zoom, min, max);
}

export function clampCamera(camera: CameraState, viewport: Size): CameraState {
  const zoom = clampZoom(camera.zoom, viewport);
  const visibleWidth = viewport.width / zoom;
  const visibleHeight = viewport.height / zoom;
  const maxX = Math.max(0, WORLD_SIZE - visibleWidth);
  const maxY = Math.max(0, WORLD_SIZE - visibleHeight);

  return {
    x: clamp(camera.x, 0, maxX),
    y: clamp(camera.y, 0, maxY),
    zoom,
  };
}

export function worldToScreen(point: Vec2, camera: CameraState): Vec2 {
  return {
    x: (point.x - camera.x) * camera.zoom,
    y: (point.y - camera.y) * camera.zoom,
  };
}

export function screenToWorld(point: Vec2, camera: CameraState): Vec2 {
  return {
    x: camera.x + point.x / camera.zoom,
    y: camera.y + point.y / camera.zoom,
  };
}

export function worldToTile(point: Vec2): TileCoord {
  return {
    col: clamp(Math.floor(point.x / TILE_SIZE), 0, WORLD_COLUMNS - 1),
    row: clamp(Math.floor(point.y / TILE_SIZE), 0, WORLD_ROWS - 1),
  };
}

export function tileToWorld(tile: TileCoord): Vec2 {
  return {
    x: tile.col * TILE_SIZE,
    y: tile.row * TILE_SIZE,
  };
}

export function zoomCameraAtScreenPoint(
  camera: CameraState,
  nextZoom: number,
  screenPoint: Vec2,
  viewport: Size,
): CameraState {
  const worldAnchor = screenToWorld(screenPoint, camera);
  const zoom = clampZoom(nextZoom, viewport);

  return clampCamera(
    {
      x: worldAnchor.x - screenPoint.x / zoom,
      y: worldAnchor.y - screenPoint.y / zoom,
      zoom,
    },
    viewport,
  );
}

export function panCameraByScreenDelta(
  camera: CameraState,
  delta: Vec2,
  viewport: Size,
): CameraState {
  return clampCamera(
    {
      x: camera.x - delta.x / camera.zoom,
      y: camera.y - delta.y / camera.zoom,
      zoom: camera.zoom,
    },
    viewport,
  );
}

export function getVisibleTileBounds(
  camera: CameraState,
  viewport: Size,
): VisibleTileBounds {
  const left = Math.max(camera.x, 0);
  const top = Math.max(camera.y, 0);
  const right = Math.min(camera.x + viewport.width / camera.zoom, WORLD_SIZE);
  const bottom = Math.min(camera.y + viewport.height / camera.zoom, WORLD_SIZE);

  return {
    startCol: clamp(Math.floor(left / TILE_SIZE), 0, WORLD_COLUMNS - 1),
    endCol: clamp(Math.ceil(right / TILE_SIZE) - 1, 0, WORLD_COLUMNS - 1),
    startRow: clamp(Math.floor(top / TILE_SIZE), 0, WORLD_ROWS - 1),
    endRow: clamp(Math.ceil(bottom / TILE_SIZE) - 1, 0, WORLD_ROWS - 1),
  };
}
