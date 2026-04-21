export type Vec2 = {
  x: number;
  y: number;
};

export type Size = {
  width: number;
  height: number;
};

export type CameraState = Vec2 & {
  zoom: number;
};

export type TileCoord = {
  col: number;
  row: number;
};

export type VisibleTileBounds = {
  startCol: number;
  endCol: number;
  startRow: number;
  endRow: number;
};
