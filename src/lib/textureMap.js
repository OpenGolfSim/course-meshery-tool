// src/lib/textureMap.js
import { svgPathProperties } from 'svg-path-properties';
import { applyToPoint } from 'transformation-matrix';
import * as THREE from 'three/webgpu';
import { RESOURCES_FILE_PROTOCOL } from '../constants';
import { TEXTURE_MAP } from '../lib/textures';


export function generatePerSurfaceSdf(layers, svgSize, resolution = 1024, maxDist = 3) {
  const scale = resolution / svgSize;
  const maxPixelDist = maxDist * scale;
  const cellSize = Math.max(maxPixelDist * 2, 4);
  const gridW = Math.ceil(resolution / cellSize);
  const gridH = Math.ceil(resolution / cellSize);

  console.time('per-surface-sdf');

  const surfaceLayers = layers.filter(
    l => l && l.visible !== false && l.splatId != null && l.data
  );

  // Group layers by splatId
  const surfaceGroups = new Map();
  const painterOrder = [];
  for (const layer of surfaceLayers) {
    const id = layer.splatId;
    if (!surfaceGroups.has(id)) {
      surfaceGroups.set(id, { splatId: id, surface: layer.surface, polygons: [] });
      painterOrder.push(id);
    }
    surfaceGroups.get(id).polygons.push(samplePath(layer.data, layer.matrix));
  }

  const maxId = Math.max(...Array.from(surfaceGroups.keys()));
  const textureCount = Math.ceil((maxId + 1) / 4);

  const packed = [];
  for (let t = 0; t < textureCount; t++) {
    packed.push(new Uint8ClampedArray(resolution * resolution * 4));
  }

  // Build per-surface data: scanline edges + distance grid
  const surfaceInfo = new Map();
  for (const [surfaceId, group] of surfaceGroups) {
    const scaledPolygons = group.polygons.map(p => p.map(([x, y]) => [x * scale, y * scale]));

    // Edges for scanline inside/outside test
    const scanEdges = [];
    for (const scaled of scaledPolygons) {
      for (let i = 0; i < scaled.length; i++) {
        const [x0, y0] = scaled[i];
        const [x1, y1] = scaled[(i + 1) % scaled.length];
        if (y0 === y1) continue;
        if (y0 < y1) {
          scanEdges.push({ yMin: y0, yMax: y1, x: x0, dx: (x1 - x0) / (y1 - y0) });
        } else {
          scanEdges.push({ yMin: y1, yMax: y0, x: x1, dx: (x0 - x1) / (y0 - y1) });
        }
      }
    }

    // Grid for distance computation
    const grid = new Array(gridW * gridH);
    for (let i = 0; i < grid.length; i++) grid[i] = [];
    let totalSegments = 0;
    for (const scaled of scaledPolygons) {
      for (let i = 0; i < scaled.length - 1; i++) {
        const a = scaled[i];
        const b = scaled[i + 1];
        const minX = Math.max(0, Math.floor(Math.min(a[0], b[0]) / cellSize) - 1);
        const maxX = Math.min(gridW - 1, Math.floor(Math.max(a[0], b[0]) / cellSize) + 1);
        const minY = Math.max(0, Math.floor(Math.min(a[1], b[1]) / cellSize) - 1);
        const maxY = Math.min(gridH - 1, Math.floor(Math.max(a[1], b[1]) / cellSize) + 1);
        for (let gy = minY; gy <= maxY; gy++) {
          for (let gx = minX; gx <= maxX; gx++) {
            grid[gy * gridW + gx].push([a, b]);
          }
        }
        totalSegments++;
      }
    }

    surfaceInfo.set(surfaceId, { scanEdges, grid, totalSegments, surface: group.surface });
  }

  // Pass 1: Analytical ownership map (painter's order, exact from polygon edges)
  const reversePainterOrder = [...painterOrder].reverse();
  const ownerMap = new Uint8Array(resolution * resolution);

  for (let y = 0; y < resolution; y++) {
    const py = y + 0.5;

    // Precompute scanline crossings for all surfaces at this row
    const rowCrossings = new Map();
    for (const [surfaceId, info] of surfaceInfo) {
      const crossings = [];
      for (const e of info.scanEdges) {
        if (py >= e.yMin && py < e.yMax) {
          crossings.push(e.x + (py - e.yMin) * e.dx);
        }
      }
      crossings.sort((a, b) => a - b);
      rowCrossings.set(surfaceId, crossings);
    }

    for (let x = 0; x < resolution; x++) {
      const px = x + 0.5;
      let owner = 0;
      for (const surfaceId of reversePainterOrder) {
        const crossings = rowCrossings.get(surfaceId);
        let inside = false;
        for (let c = 0; c < crossings.length - 1; c += 2) {
          if (px >= crossings[c] && px < crossings[c + 1]) {
            inside = true;
            break;
          }
        }
        if (inside) {
          owner = surfaceId;
          break;
        }
      }
      ownerMap[y * resolution + x] = owner;
    }
  }

  // Pass 2: Per-surface SDF with grid-bucketed distance + analytical sign
  for (const [surfaceId, info] of surfaceInfo) {
    const texIdx = Math.floor(surfaceId / 4);
    const channel = surfaceId % 4;
    const target = packed[texIdx];

    for (let y = 0; y < resolution; y++) {
      const py = y + 0.5;
      const gy = Math.min(gridH - 1, Math.floor(py / cellSize));
      for (let x = 0; x < resolution; x++) {
        const px = x + 0.5;
        const gx = Math.min(gridW - 1, Math.floor(px / cellSize));

        let minDist = maxPixelDist;
        const nearby = info.grid[gy * gridW + gx];
        for (let s = 0; s < nearby.length; s++) {
          const [a, b] = nearby[s];
          const d = pointToSegmentDist(px, py, a[0], a[1], b[0], b[1]);
          if (d < minDist) minDist = d;
        }

        const isInside = ownerMap[y * resolution + x] === surfaceId;

        const normalized = Math.min(1, minDist / maxPixelDist);
        let encoded;
        if (isInside) {
          encoded = 128 + Math.round(normalized * 127);
        } else {
          encoded = 128 - Math.round(normalized * 128);
        }

        target[(y * resolution + x) * 4 + channel] = encoded;
      }
    }

    console.log(`SDF: ${info.surface} (id=${surfaceId}) done (${info.totalSegments} segments)`);
  }

  console.timeEnd('per-surface-sdf');

  return {
    textures: packed.map(data => new ImageData(new Uint8ClampedArray(data), resolution, resolution)),
    textureCount,
    maxId,
  };
}

function nearestPointOnSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return [ax, ay];
  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return [ax + t * dx, ay + t * dy];
}

export function generateSdfMap(layers, idMapImageData, svgSize, resolution = 1024, maxDist = 5) {
  const scale = resolution / svgSize;
  const maxPixelDist = maxDist * scale;
  const cellSize = Math.max(maxPixelDist * 2, 4);
  const gridW = Math.ceil(resolution / cellSize);
  const gridH = Math.ceil(resolution / cellSize);

  // Scale the ID map to SDF resolution to know each pixel's surface
  const idScale = resolution / idMapImageData.width;
  const idSrc = idMapImageData.data;
  const idW = idMapImageData.width;

  function getIdAt(px, py) {
    const ix = Math.min(idW - 1, Math.max(0, Math.floor(px / idScale)));
    const iy = Math.min(idW - 1, Math.max(0, Math.floor(py / idScale)));
    return idSrc[(iy * idW + ix) * 4];
  }

  // Collect all edge segments, tagged with their surface ID
  const allSegments = [];
  for (const layer of layers) {
    if (!layer || layer.visible === false) continue;
    if (layer.splatId == null || !layer.data) continue;
    const polygon = samplePath(layer.data, layer.matrix);
    const scaled = polygon.map(([x, y]) => [x * scale, y * scale]);
    for (let i = 0; i < scaled.length - 1; i++) {
      allSegments.push({ a: scaled[i], b: scaled[i + 1], surfaceId: layer.splatId });
    }
  }

  // Bucket segments into grid cells
  const grid = new Array(gridW * gridH);
  for (let i = 0; i < grid.length; i++) grid[i] = [];

  for (const seg of allSegments) {
    const minX = Math.max(0, Math.floor(Math.min(seg.a[0], seg.b[0]) / cellSize) - 1);
    const maxX = Math.min(gridW - 1, Math.floor(Math.max(seg.a[0], seg.b[0]) / cellSize) + 1);
    const minY = Math.max(0, Math.floor(Math.min(seg.a[1], seg.b[1]) / cellSize) - 1);
    const maxY = Math.min(gridH - 1, Math.floor(Math.max(seg.a[1], seg.b[1]) / cellSize) + 1);
    for (let gy = minY; gy <= maxY; gy++) {
      for (let gx = minX; gx <= maxX; gx++) {
        grid[gy * gridW + gx].push(seg);
      }
    }
  }

  console.time('sdf-fill');
  const distOut = new Uint8ClampedArray(resolution * resolution * 4);
  const neighborOut = new Uint8ClampedArray(resolution * resolution * 4);

  for (let y = 0; y < resolution; y++) {
    const py = y + 0.5;
    const gy = Math.min(gridH - 1, Math.floor(py / cellSize));
    for (let x = 0; x < resolution; x++) {
      const px = x + 0.5;
      const gx = Math.min(gridW - 1, Math.floor(px / cellSize));
      const myId = getIdAt(px, py);

      let minDist = maxPixelDist;
      let nearestNeighborId = myId;

      const nearby = grid[gy * gridW + gx];
      for (let s = 0; s < nearby.length; s++) {
        const seg = nearby[s];
        // // Only measure distance to edges from OTHER surfaces
        // if (seg.surfaceId === myId) continue;
        const d = pointToSegmentDist(px, py, seg.a[0], seg.a[1], seg.b[0], seg.b[1]);
        if (d < minDist) {
          minDist = d;
          // nearestNeighborId = seg.surfaceId;
          if (seg.surfaceId !== myId) {
            nearestNeighborId = seg.surfaceId;
          } else {
            // Nearest edge is my own surface's boundary
            // Sample the ID map on the other side to find the neighbor
            const [nx, ny] = nearestPointOnSegment(px, py, seg.a[0], seg.a[1], seg.b[0], seg.b[1]);
            const dirX = nx - px;
            const dirY = ny - py;
            const len = Math.sqrt(dirX * dirX + dirY * dirY);
            if (len > 0.01) {
              const otherX = nx + (dirX / len) * 1.5;
              const otherY = ny + (dirY / len) * 1.5;
              const otherId = getIdAt(otherX, otherY);
              if (otherId !== myId) nearestNeighborId = otherId;
            }
          }

        }
      }

      const normalized = Math.min(1, minDist / maxPixelDist);
      const encoded = Math.round(normalized * 255);
      const pi = (y * resolution + x) * 4;

      distOut[pi] = encoded;
      distOut[pi + 1] = encoded;
      distOut[pi + 2] = encoded;
      distOut[pi + 3] = 255;

      neighborOut[pi] = nearestNeighborId;
      neighborOut[pi + 1] = nearestNeighborId;
      neighborOut[pi + 2] = nearestNeighborId;
      neighborOut[pi + 3] = 255;
    }
  }
  console.timeEnd('sdf-fill');
  let minD = 255, maxD = 0, zeroCount = 0;
  for (let i = 0; i < resolution * resolution; i++) {
    const v = distOut[i * 4];
    if (v < minD) minD = v;
    if (v > maxD) maxD = v;
    if (v === 0) zeroCount++;
  }
  console.log('Distance values:', JSON.stringify({ min: minD, max: maxD, zeroCount, totalPixels: resolution * resolution }));
  console.log('SDF stats:', JSON.stringify({
    resolution,
    maxPixelDist,
    cellSize,
    segments: allSegments.length,
    gridCells: gridW + 'x' + gridH,
  }));

  return {
    distance: new ImageData(distOut, resolution, resolution),
    neighbor: new ImageData(neighborOut, resolution, resolution),
  };
}

function pointToSegmentDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - ax, py - ay);

  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));

  const projX = ax + t * dx;
  const projY = ay + t * dy;
  return Math.hypot(px - projX, py - projY);
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load: ${url}`));
    img.src = url;
  });
}

export async function loadSurfaceTextureArray(palette, size = 1024) {
  // const maxId = Math.max(...Object.values(palette).map(p => p.splatId));
  const maxId = Math.max(...Object.values(palette).map(p => p.id));

  const layerCount = maxId + 1;
  const data = new Uint8Array(size * size * 4 * layerCount);

  for (const [surface, entry] of Object.entries(palette)) {
    const texConfig = TEXTURE_MAP[surface];
    if (!texConfig?.baseColor) continue;

    const url = `${RESOURCES_FILE_PROTOCOL}://textures/${texConfig.baseColor}`;
    const img = await loadImage(url);

    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, size, size);
    const imageData = ctx.getImageData(0, 0, size, size);

    // const offset = entry.splatId * size * size * 4;
    const offset = entry.id * size * size * 4;
    data.set(imageData.data, offset);
  }

  const tex = new THREE.DataArrayTexture(data, size, size, layerCount);
  tex.needsUpdate = true;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function generateIdMap(layers, svgSize, resolution = 2048) {
  const pixels = new Uint8ClampedArray(resolution * resolution * 4);

  // Fill with base (splatId 0)
  for (let i = 3; i < pixels.length; i += 4) {
    pixels[i] = 255; // alpha
  }

  const scale = resolution / svgSize;

  for (const layer of layers) {
    if (!layer || layer.visible === false) continue;
    if (layer.splatId == null || !layer.data) continue;

    const polygon = samplePath(layer.data, layer.matrix);
    const scaled = polygon.map(([x, y]) => [x * scale, y * scale]);
    scanlineFill(pixels, resolution, scaled, layer.splatId);
  }

  return new ImageData(pixels, resolution, resolution);
}

function samplePath(d, matrix, minPoints = 2000, maxPoints = 20000) {
  const props = new svgPathProperties(d);
  const totalLength = props.getTotalLength();
  const numPoints = Math.min(Math.max(Math.round(totalLength), minPoints), maxPoints);
  const points = [];

  for (let i = 0; i <= numPoints; i++) {
    const pos = props.getPointAtLength(totalLength * (i / numPoints));
    if (matrix) {
      const t = applyToPoint(matrix, { x: pos.x, y: pos.y });
      points.push([t.x, t.y]);
    } else {
      points.push([pos.x, pos.y]);
    }
  }

  return points;
}

function scanlineFill(pixels, resolution, polygon, id) {
  if (polygon.length < 3) return;

  // Build edge table
  const edges = [];
  for (let i = 0; i < polygon.length; i++) {
    const [x0, y0] = polygon[i];
    const [x1, y1] = polygon[(i + 1) % polygon.length];
    if (Math.round(y0) === Math.round(y1)) continue; // skip horizontal
    if (y0 < y1) {
      edges.push({ yMin: y0, yMax: y1, x: x0, dx: (x1 - x0) / (y1 - y0) });
    } else {
      edges.push({ yMin: y1, yMax: y0, x: x1, dx: (x0 - x1) / (y0 - y1) });
    }
  }

  // Find Y range
  let minY = resolution, maxY = 0;
  for (const e of edges) {
    if (e.yMin < minY) minY = e.yMin;
    if (e.yMax > maxY) maxY = e.yMax;
  }
  minY = Math.max(0, Math.floor(minY));
  maxY = Math.min(resolution - 1, Math.floor(maxY));

  // Scan each row
  for (let y = minY; y <= maxY; y++) {
    const scanY = y + 0.5;
    const crossings = [];

    for (const e of edges) {
      if (scanY >= e.yMin && scanY < e.yMax) {
        crossings.push(e.x + (scanY - e.yMin) * e.dx);
      }
    }

    crossings.sort((a, b) => a - b);

    // Fill between pairs (even-odd rule)
    for (let i = 0; i < crossings.length - 1; i += 2) {
      const xStart = Math.max(0, Math.ceil(crossings[i]));
      const xEnd = Math.min(resolution - 1, Math.floor(crossings[i + 1]));
      for (let x = xStart; x <= xEnd; x++) {
        const pi = (y * resolution + x) * 4;
        pixels[pi] = id;
        pixels[pi + 1] = id;
        pixels[pi + 2] = id;
        pixels[pi + 3] = 255;
      }
    }
  }
}

export async function canvasToPngBuffer(canvas) {
  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png');
  });
  return blob.arrayBuffer();
}
