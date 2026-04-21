import { DEFAULT_ZOOM, TILE_SIZE, WORLD_SIZE } from "@/lib/world/constants";
import {
  getGrassVariantForTile,
  getInitialRoadFocusZoom,
  getRoadFocusWorldPosition,
  isOceanTile,
  isRoadTile,
  loadTerrainSprites,
  type TerrainSprites,
} from "@/lib/world/terrain";
import {
  clamp,
  clampCamera,
  clampZoom,
  getVisibleTileBounds,
  panCameraByScreenDelta,
  screenToWorld,
  tileToWorld,
  worldToScreen,
  worldToTile,
  zoomCameraAtScreenPoint,
} from "@/lib/world/transforms";
import type {
  CameraState,
  Size,
  TileCoord,
  Vec2,
  VisibleTileBounds,
} from "@/lib/world/types";

const ZOOM_SENSITIVITY = 0.0015;
const HOVERED_TILE_FILL = "rgba(250, 204, 21, 0.18)";
const HOVERED_TILE_STROKE = "rgba(250, 204, 21, 0.95)";
const LABEL_ZOOM_THRESHOLD = 1.75;
const LABEL_TILE_LIMIT = 196;

export class WorldRuntime {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private viewport: Size = { width: 1, height: 1 };
  private dpr = 1;
  private camera: CameraState = { x: 0, y: 0, zoom: DEFAULT_ZOOM };
  private terrainSprites: TerrainSprites | null = null;
  private frameId: number | null = null;
  private activePointerId: number | null = null;
  private hoveredTile: TileCoord | null = null;
  private lastPointerPosition: Vec2 | null = null;
  private destroyed = false;
  private hasInitializedCamera = false;

  constructor(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d");

    if (!ctx) {
      throw new Error("2D canvas context is not available.");
    }

    this.canvas = canvas;
    this.ctx = ctx;
  }

  public start() {
    this.attachEventListeners();
    this.preloadTerrainSprites();
    this.canvas.style.cursor = "grab";
    this.invalidate();
  }

  public destroy() {
    this.destroyed = true;
    this.endDrag();
    this.detachEventListeners();

    if (this.frameId !== null) {
      window.cancelAnimationFrame(this.frameId);
      this.frameId = null;
    }
  }

  public resize(width: number, height: number, dpr: number) {
    const nextViewport = {
      width: Math.max(1, Math.round(width)),
      height: Math.max(1, Math.round(height)),
    };
    const nextDpr = Math.max(1, dpr);
    const hadRealViewport = this.viewport.width > 1 || this.viewport.height > 1;
    const centerWorld = hadRealViewport
      ? screenToWorld(
          {
            x: this.viewport.width / 2,
            y: this.viewport.height / 2,
          },
          this.camera,
        )
      : getRoadFocusWorldPosition();

    this.viewport = nextViewport;
    this.dpr = nextDpr;

    const pixelWidth = Math.max(1, Math.round(nextViewport.width * nextDpr));
    const pixelHeight = Math.max(1, Math.round(nextViewport.height * nextDpr));

    if (this.canvas.width !== pixelWidth) {
      this.canvas.width = pixelWidth;
    }

    if (this.canvas.height !== pixelHeight) {
      this.canvas.height = pixelHeight;
    }

    this.canvas.style.width = `${nextViewport.width}px`;
    this.canvas.style.height = `${nextViewport.height}px`;

    const initialZoom = Math.max(
      DEFAULT_ZOOM,
      getInitialRoadFocusZoom(nextViewport),
    );
    const zoom = clampZoom(
      hadRealViewport || this.hasInitializedCamera ? this.camera.zoom : initialZoom,
      nextViewport,
    );

    this.camera = clampCamera(
      {
        x: centerWorld.x - nextViewport.width / (2 * zoom),
        y: centerWorld.y - nextViewport.height / (2 * zoom),
        zoom,
      },
      nextViewport,
    );
    this.hasInitializedCamera = true;

    this.invalidate();
  }

  private attachEventListeners() {
    this.canvas.addEventListener("pointerdown", this.onPointerDown);
    this.canvas.addEventListener("pointermove", this.onPointerMove);
    this.canvas.addEventListener("pointerleave", this.onPointerLeave);
    this.canvas.addEventListener("pointerup", this.onPointerUp);
    this.canvas.addEventListener("pointercancel", this.onPointerCancel);
    this.canvas.addEventListener("lostpointercapture", this.onLostPointerCapture);
    this.canvas.addEventListener("wheel", this.onWheel, { passive: false });
  }

  private detachEventListeners() {
    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    this.canvas.removeEventListener("pointermove", this.onPointerMove);
    this.canvas.removeEventListener("pointerleave", this.onPointerLeave);
    this.canvas.removeEventListener("pointerup", this.onPointerUp);
    this.canvas.removeEventListener("pointercancel", this.onPointerCancel);
    this.canvas.removeEventListener(
      "lostpointercapture",
      this.onLostPointerCapture,
    );
    this.canvas.removeEventListener("wheel", this.onWheel);
  }

  private onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0) {
      return;
    }

    const pointerPosition = this.getCanvasPoint(event);
    this.activePointerId = event.pointerId;
    this.hoveredTile = this.getTileAtCanvasPoint(pointerPosition);
    this.lastPointerPosition = pointerPosition;
    this.canvas.setPointerCapture(event.pointerId);
    this.canvas.style.cursor = "grabbing";
    this.invalidate();
    event.preventDefault();
  };

  private onPointerMove = (event: PointerEvent) => {
    const pointerPosition = this.getCanvasPoint(event);
    const nextHoveredTile = this.getTileAtCanvasPoint(pointerPosition);
    const hoverChanged = !areTilesEqual(this.hoveredTile, nextHoveredTile);

    this.hoveredTile = nextHoveredTile;

    if (this.activePointerId === null) {
      if (hoverChanged) {
        this.invalidate();
      }
      return;
    }

    if (
      this.activePointerId !== event.pointerId ||
      this.lastPointerPosition === null
    ) {
      return;
    }

    const delta = {
      x: pointerPosition.x - this.lastPointerPosition.x,
      y: pointerPosition.y - this.lastPointerPosition.y,
    };

    this.camera = panCameraByScreenDelta(this.camera, delta, this.viewport);
    this.lastPointerPosition = pointerPosition;
    this.invalidate();
  };

  private onPointerLeave = () => {
    if (this.activePointerId !== null || this.hoveredTile === null) {
      return;
    }

    this.hoveredTile = null;
    this.invalidate();
  };

  private onPointerUp = (event: PointerEvent) => {
    this.endDrag(event.pointerId);
  };

  private onPointerCancel = (event: PointerEvent) => {
    this.endDrag(event.pointerId);
  };

  private onLostPointerCapture = () => {
    this.endDrag();
  };

  private onWheel = (event: WheelEvent) => {
    event.preventDefault();

    const pointerPosition = this.getCanvasPoint(event);
    const zoomFactor = Math.exp(-event.deltaY * ZOOM_SENSITIVITY);

    this.camera = zoomCameraAtScreenPoint(
      this.camera,
      this.camera.zoom * zoomFactor,
      pointerPosition,
      this.viewport,
    );
    this.hoveredTile = this.getTileAtCanvasPoint(pointerPosition);
    this.invalidate();
  };

  // Input events can arrive faster than the browser can paint, so drawing is
  // coalesced into a single requestAnimationFrame callback.
  private invalidate() {
    if (this.frameId !== null) {
      return;
    }

    this.frameId = window.requestAnimationFrame(this.render);
  }

  private render = () => {
    this.frameId = null;

    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.ctx.imageSmoothingEnabled = true;
    this.ctx.imageSmoothingQuality = "high";

    this.drawBackdrop();
    this.drawWorld();
    this.drawHud();
  };

  private drawBackdrop() {
    const gradient = this.ctx.createLinearGradient(
      0,
      0,
      this.viewport.width,
      this.viewport.height,
    );

    gradient.addColorStop(0, "#07131d");
    gradient.addColorStop(1, "#102433");

    this.ctx.fillStyle = gradient;
    this.ctx.fillRect(0, 0, this.viewport.width, this.viewport.height);
  }

  private drawWorld() {
    const worldOrigin = worldToScreen({ x: 0, y: 0 }, this.camera);
    const worldSpan = WORLD_SIZE * this.camera.zoom;
    const worldGradient = this.ctx.createLinearGradient(
      worldOrigin.x,
      worldOrigin.y,
      worldOrigin.x + worldSpan,
      worldOrigin.y + worldSpan,
    );

    worldGradient.addColorStop(0, "#112536");
    worldGradient.addColorStop(1, "#0c1b28");

    this.ctx.fillStyle = worldGradient;
    this.ctx.fillRect(worldOrigin.x, worldOrigin.y, worldSpan, worldSpan);

    const visibleTiles = getVisibleTileBounds(this.camera, this.viewport);
    const tileScreenSize = TILE_SIZE * this.camera.zoom;
    const visibleTileCount =
      (visibleTiles.endCol - visibleTiles.startCol + 1) *
      (visibleTiles.endRow - visibleTiles.startRow + 1);
    const showLabels =
      this.camera.zoom >= LABEL_ZOOM_THRESHOLD &&
      visibleTileCount <= LABEL_TILE_LIMIT;

    for (let row = visibleTiles.startRow; row <= visibleTiles.endRow; row += 1) {
      for (let col = visibleTiles.startCol; col <= visibleTiles.endCol; col += 1) {
        const screen = worldToScreen(tileToWorld({ col, row }), this.camera);
        if (isRoadTile(col, row)) {
          const roadImage = this.terrainSprites?.roadStraight;

          if (roadImage !== undefined) {
            this.ctx.drawImage(
              roadImage,
              screen.x,
              screen.y,
              Math.ceil(tileScreenSize) + 1,
              Math.ceil(tileScreenSize) + 1,
            );
          } else {
            this.drawRoadFallback(screen, tileScreenSize);
          }
        } else if (isOceanTile(col, row)) {
          const oceanImage = this.terrainSprites?.ocean;

          if (oceanImage !== undefined) {
            this.ctx.drawImage(
              oceanImage,
              screen.x,
              screen.y,
              Math.ceil(tileScreenSize) + 1,
              Math.ceil(tileScreenSize) + 1,
            );
          } else {
            this.ctx.fillStyle = "#1caed1";
            this.ctx.fillRect(
              screen.x,
              screen.y,
              Math.ceil(tileScreenSize) + 1,
              Math.ceil(tileScreenSize) + 1,
            );
          }
        } else {
          const variantIndex = getGrassVariantForTile(col, row);
          const grassImage = this.terrainSprites?.grassVariants[variantIndex];

          if (grassImage !== undefined) {
            this.ctx.drawImage(
              grassImage,
              screen.x,
              screen.y,
              Math.ceil(tileScreenSize) + 1,
              Math.ceil(tileScreenSize) + 1,
            );
          } else {
            this.ctx.fillStyle = this.getFallbackTileFill(variantIndex);
            this.ctx.fillRect(
              screen.x,
              screen.y,
              Math.ceil(tileScreenSize) + 1,
              Math.ceil(tileScreenSize) + 1,
            );
          }
        }

        if (showLabels) {
          this.drawTileLabel({ col, row }, screen, tileScreenSize);
        }
      }
    }

    this.drawGridLines(visibleTiles, tileScreenSize);
    this.drawHoveredTile(tileScreenSize);
    this.ctx.strokeStyle = "rgba(248, 250, 252, 0.16)";
    this.ctx.lineWidth = 2;
    this.ctx.strokeRect(worldOrigin.x, worldOrigin.y, worldSpan, worldSpan);
  }

  private drawRoadFallback(tileScreenPosition: Vec2, tileScreenSize: number) {
    const shoulderHeight = tileScreenSize * 0.18;

    this.ctx.fillStyle = "#8a8a8a";
    this.ctx.fillRect(
      tileScreenPosition.x,
      tileScreenPosition.y,
      tileScreenSize,
      shoulderHeight,
    );
    this.ctx.fillRect(
      tileScreenPosition.x,
      tileScreenPosition.y + tileScreenSize - shoulderHeight,
      tileScreenSize,
      shoulderHeight,
    );

    this.ctx.fillStyle = "#555";
    this.ctx.fillRect(
      tileScreenPosition.x,
      tileScreenPosition.y + shoulderHeight,
      tileScreenSize,
      tileScreenSize - shoulderHeight * 2,
    );

    this.ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
    this.ctx.lineWidth = Math.max(2, tileScreenSize * 0.06);
    this.ctx.setLineDash([tileScreenSize * 0.18, tileScreenSize * 0.14]);
    this.ctx.beginPath();
    this.ctx.moveTo(
      tileScreenPosition.x,
      tileScreenPosition.y + tileScreenSize / 2,
    );
    this.ctx.lineTo(
      tileScreenPosition.x + tileScreenSize,
      tileScreenPosition.y + tileScreenSize / 2,
    );
    this.ctx.stroke();
    this.ctx.setLineDash([]);
  }

  private drawGridLines(
    visibleTiles: VisibleTileBounds,
    tileScreenSize: number,
  ) {
    const top = worldToScreen(
      { x: 0, y: visibleTiles.startRow * TILE_SIZE },
      this.camera,
    ).y;
    const bottom = worldToScreen(
      { x: 0, y: (visibleTiles.endRow + 1) * TILE_SIZE },
      this.camera,
    ).y;
    const left = worldToScreen(
      { x: visibleTiles.startCol * TILE_SIZE, y: 0 },
      this.camera,
    ).x;
    const right = worldToScreen(
      { x: (visibleTiles.endCol + 1) * TILE_SIZE, y: 0 },
      this.camera,
    ).x;

    if (tileScreenSize >= 12) {
      this.ctx.beginPath();

      for (
        let col = visibleTiles.startCol;
        col <= visibleTiles.endCol + 1;
        col += 1
      ) {
        if (col % 5 === 0) {
          continue;
        }

        const x =
          Math.round(worldToScreen({ x: col * TILE_SIZE, y: 0 }, this.camera).x) +
          0.5;
        this.ctx.moveTo(x, top);
        this.ctx.lineTo(x, bottom);
      }

      for (
        let row = visibleTiles.startRow;
        row <= visibleTiles.endRow + 1;
        row += 1
      ) {
        if (row % 5 === 0) {
          continue;
        }

        const y =
          Math.round(worldToScreen({ x: 0, y: row * TILE_SIZE }, this.camera).y) +
          0.5;
        this.ctx.moveTo(left, y);
        this.ctx.lineTo(right, y);
      }

      this.ctx.strokeStyle = "rgba(226, 232, 240, 0.08)";
      this.ctx.lineWidth = 1;
      this.ctx.stroke();
    }

    this.ctx.beginPath();

    for (
      let col = visibleTiles.startCol;
      col <= visibleTiles.endCol + 1;
      col += 1
    ) {
      if (col % 5 !== 0) {
        continue;
      }

      const x =
        Math.round(worldToScreen({ x: col * TILE_SIZE, y: 0 }, this.camera).x) +
        0.5;
      this.ctx.moveTo(x, top);
      this.ctx.lineTo(x, bottom);
    }

    for (
      let row = visibleTiles.startRow;
      row <= visibleTiles.endRow + 1;
      row += 1
    ) {
      if (row % 5 !== 0) {
        continue;
      }

      const y =
        Math.round(worldToScreen({ x: 0, y: row * TILE_SIZE }, this.camera).y) +
        0.5;
      this.ctx.moveTo(left, y);
      this.ctx.lineTo(right, y);
    }

    this.ctx.strokeStyle = "rgba(251, 191, 36, 0.18)";
    this.ctx.lineWidth = 1;
    this.ctx.stroke();
  }

  private drawHoveredTile(tileScreenSize: number) {
    if (this.hoveredTile === null) {
      return;
    }

    const tileScreenPosition = worldToScreen(
      tileToWorld(this.hoveredTile),
      this.camera,
    );

    if (
      tileScreenPosition.x > this.viewport.width ||
      tileScreenPosition.y > this.viewport.height ||
      tileScreenPosition.x + tileScreenSize < 0 ||
      tileScreenPosition.y + tileScreenSize < 0
    ) {
      return;
    }

    this.ctx.fillStyle = HOVERED_TILE_FILL;
    this.ctx.fillRect(
      tileScreenPosition.x,
      tileScreenPosition.y,
      tileScreenSize,
      tileScreenSize,
    );

    this.ctx.strokeStyle = HOVERED_TILE_STROKE;
    this.ctx.lineWidth = clamp(this.camera.zoom * 1.1, 1, 3);
    this.ctx.strokeRect(
      tileScreenPosition.x,
      tileScreenPosition.y,
      tileScreenSize,
      tileScreenSize,
    );
  }

  private drawTileLabel(
    tile: TileCoord,
    tileScreenPosition: Vec2,
    tileScreenSize: number,
  ) {
    this.ctx.fillStyle = "rgba(226, 232, 240, 0.82)";
    this.ctx.font =
      '600 12px "IBM Plex Mono", "SFMono-Regular", ui-monospace, monospace';
    this.ctx.textAlign = "center";
    this.ctx.textBaseline = "middle";
    this.ctx.fillText(
      `${tile.col},${tile.row}`,
      tileScreenPosition.x + tileScreenSize / 2,
      tileScreenPosition.y + tileScreenSize / 2,
    );
  }

  private drawHud() {
    const centerWorld = screenToWorld(
      { x: this.viewport.width / 2, y: this.viewport.height / 2 },
      this.camera,
    );
    const centerTile = worldToTile(centerWorld);
    const hoveredTileLabel =
      this.hoveredTile === null
        ? "--"
        : `${this.hoveredTile.col}, ${this.hoveredTile.row}`;
    const visibleTiles = getVisibleTileBounds(this.camera, this.viewport);
    const visibleTileCount =
      (visibleTiles.endCol - visibleTiles.startCol + 1) *
      (visibleTiles.endRow - visibleTiles.startRow + 1);

    const panelWidth = 248;
    const panelHeight = 114;
    const panelX = Math.max(16, this.viewport.width - panelWidth - 24);
    const panelY = Math.max(16, this.viewport.height - panelHeight - 24);

    this.ctx.fillStyle = "rgba(2, 6, 23, 0.62)";
    this.ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    this.ctx.roundRect(panelX, panelY, panelWidth, panelHeight, 18);
    this.ctx.fill();
    this.ctx.stroke();

    this.ctx.fillStyle = "rgba(250, 204, 21, 0.92)";
    this.ctx.font =
      '700 11px "IBM Plex Mono", "SFMono-Regular", ui-monospace, monospace';
    this.ctx.textAlign = "left";
    this.ctx.textBaseline = "top";
    this.ctx.fillText("CAMERA", panelX + 16, panelY + 14);

    this.ctx.fillStyle = "rgba(226, 232, 240, 0.88)";
    this.ctx.font =
      '500 12px "IBM Plex Mono", "SFMono-Regular", ui-monospace, monospace';
    this.ctx.fillText(
      `center ${Math.round(centerWorld.x)}, ${Math.round(centerWorld.y)}`,
      panelX + 16,
      panelY + 34,
    );
    this.ctx.fillText(
      `tile ${centerTile.col}, ${centerTile.row}`,
      panelX + 16,
      panelY + 52,
    );
    this.ctx.fillText(
      `hover ${hoveredTileLabel}`,
      panelX + 16,
      panelY + 70,
    );
    this.ctx.fillText(
      `zoom ${this.camera.zoom.toFixed(2)}  visible ${visibleTileCount}`,
      panelX + 16,
      panelY + 88,
    );
  }

  private getFallbackTileFill(variantIndex: number) {
    if (variantIndex === 1) {
      return "#6a9f57";
    }

    if (variantIndex === 2) {
      return "#73ab5f";
    }

    return "#6fa85a";
  }

  private getCanvasPoint(event: MouseEvent | PointerEvent | WheelEvent): Vec2 {
    const bounds = this.canvas.getBoundingClientRect();

    return {
      x: event.clientX - bounds.left,
      y: event.clientY - bounds.top,
    };
  }

  private getTileAtCanvasPoint(point: Vec2) {
    if (
      point.x < 0 ||
      point.y < 0 ||
      point.x > this.viewport.width ||
      point.y > this.viewport.height
    ) {
      return null;
    }

    const worldPoint = screenToWorld(point, this.camera);

    return worldToTile({
      x: clamp(worldPoint.x, 0, WORLD_SIZE - Number.EPSILON),
      y: clamp(worldPoint.y, 0, WORLD_SIZE - Number.EPSILON),
    });
  }

  private preloadTerrainSprites() {
    loadTerrainSprites()
      .then((terrainSprites) => {
        if (this.destroyed) {
          return;
        }

        this.terrainSprites = terrainSprites;
        this.invalidate();
      })
      .catch((error: unknown) => {
        console.error("Failed to preload terrain sprites.", error);
      });
  }

  private endDrag(pointerId?: number) {
    if (pointerId !== undefined && pointerId !== this.activePointerId) {
      return;
    }

    if (
      this.activePointerId !== null &&
      this.canvas.hasPointerCapture(this.activePointerId)
    ) {
      this.canvas.releasePointerCapture(this.activePointerId);
    }

    this.activePointerId = null;
    this.lastPointerPosition = null;
    this.canvas.style.cursor = "grab";
  }
}

function areTilesEqual(a: TileCoord | null, b: TileCoord | null) {
  if (a === null || b === null) {
    return a === b;
  }

  return a.col === b.col && a.row === b.row;
}
