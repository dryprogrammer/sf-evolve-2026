import { STATIONS, WORLD, type SceneState, type Station, type Point } from './world';

// All artwork is original canvas geometry. Coordinates are world pixels; the
// caller owns the viewport/DPR transform. Feet, markers and collision footprints
// share world.ts coordinates. Furniture extrudes upwards, never into the aisles.
const C = {
  ink: '#344c48', muted: '#71827a', floor: '#d4ddd0', grout: '#c4cec1',
  cream: '#eee9d5', creamLight: '#faf3df', wallShade: '#c9cab3',
  wood: '#bc8e5c', woodLight: '#dfbb80', woodDark: '#896746',
  metal: '#59736e', metalLight: '#9cb2a6', metalDark: '#3d5552',
  teal: '#438c7c', mint: '#b9d2a1', gold: '#dbb770',
};
const PALETTES = {
  maya: { skin: '#bd815e', shade: '#985b43', hair: '#382f2b', shirt: '#be754f', light: '#e2a16e', pants: '#425b65' },
  alex: { skin: '#efc498', shade: '#c7946d', hair: '#85603e', shirt: '#627d92', light: '#93b4bd', pants: '#3e5157' },
  river: { skin: '#85573e', shade: '#634232', hair: '#272f32', shirt: '#788351', light: '#b3bb7d', pants: '#56546b' },
};
type HumanId = keyof typeof PALETTES;
type Facing = SceneState['facing'];

function rect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}
function line(ctx: CanvasRenderingContext2D, points: number[], color: string, width = 2) {
  ctx.beginPath();
  ctx.moveTo(points[0], points[1]);
  for (let i = 2; i < points.length; i += 2) ctx.lineTo(points[i], points[i + 1]);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
}
function poly(ctx: CanvasRenderingContext2D, points: number[], color: string) {
  ctx.beginPath();
  ctx.moveTo(points[0], points[1]);
  for (let i = 2; i < points.length; i += 2) ctx.lineTo(points[i], points[i + 1]);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}
function text(ctx: CanvasRenderingContext2D, value: string, x: number, y: number, size = 13, color = C.ink, align: CanvasTextAlign = 'left') {
  ctx.font = `600 ${size}px ui-monospace, SFMono-Regular, Consolas, monospace`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.fillText(value, x, y);
}
function shadow(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  rect(ctx, x + 5, y + 5, w, h, '#314b4421');
  rect(ctx, x + 2, y + 3, w, h, '#314b4414');
}
function bolts(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  for (const [dx, dy] of [[3, 3], [w - 5, 3], [3, h - 5], [w - 5, h - 5]]) {
    rect(ctx, x + dx, y + dy, 2, 2, C.cream);
  }
}
function panel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color = C.metal) {
  rect(ctx, x, y, w, h, C.metalDark);
  rect(ctx, x + 2, y + 2, w - 4, h - 5, color);
  rect(ctx, x + 3, y + 2, w - 6, 2, C.metalLight);
  bolts(ctx, x, y, w, h);
}
function wood(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  rect(ctx, x, y, w, h, C.woodDark);
  rect(ctx, x + 2, y + 2, w - 4, h - 5, C.woodLight);
  for (let yy = y + 12; yy < y + h - 4; yy += 14) {
    rect(ctx, x + 2, yy, w - 4, 1, C.wood);
    for (let xx = x + 14; xx < x + w - 12; xx += 47) {
      rect(ctx, xx, yy - 5, 21, 1, '#c99e67');
      rect(ctx, xx + 10, yy - 3, 12, 1, '#d0a872');
    }
  }
  rect(ctx, x + 3, y + 2, w - 6, 2, '#f0d09a');
}
function plant(ctx: CanvasRenderingContext2D, x: number, y: number, size = 1) {
  // y is the base, not the leaf tip.
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  ctx.scale(size, size);
  shadow(ctx, -10, -6, 24, 7);
  rect(ctx, -8, -15, 16, 13, '#ad7858');
  rect(ctx, -10, -18, 20, 5, '#d6a278');
  rect(ctx, -6, -13, 3, 9, '#dcaf80');
  rect(ctx, -1, -43, 3, 27, '#526a47');
  for (const [dx, dy, flip] of [[-15, -35, 0], [1, -43, 1], [-12, -49, 0], [2, -29, 1], [-8, -57, 1]]) {
    rect(ctx, dx, dy, 12, 7, flip ? '#6e915c' : '#456e54');
    rect(ctx, dx + 2, dy - 3, 7, 3, '#8fa56a');
    rect(ctx, dx + 2, dy + 3, 8, 2, '#a9bc7b');
  }
  ctx.restore();
}
function crate(ctx: CanvasRenderingContext2D, x: number, y: number, w = 32, h = 27) {
  shadow(ctx, x, y, w, h);
  wood(ctx, x, y, w, h);
  rect(ctx, x + 4, y + 2, 4, h - 4, C.wood);
  rect(ctx, x + w - 8, y + 2, 4, h - 4, C.wood);
  line(ctx, [x + 7, y + h - 6, x + w - 8, y + 7], C.woodDark, 3);
  bolts(ctx, x, y, w, h);
}
function lamp(ctx: CanvasRenderingContext2D, x: number, y: number) {
  rect(ctx, x - 8, y - 3, 20, 4, C.metalDark);
  line(ctx, [x + 3, y - 4, x + 3, y - 31, x - 12, y - 41], C.metalDark, 3);
  poly(ctx, [x - 20, y - 40, x - 7, y - 40, x - 2, y - 32, x - 25, y - 32], C.teal);
  rect(ctx, x - 23, y - 32, 19, 3, '#ecdc9c');
  poly(ctx, [x - 21, y - 29, x - 5, y - 29, x + 8, y - 6, x - 31, y - 6], '#f2d99125');
}
function monitor(ctx: CanvasRenderingContext2D, x: number, y: number, w = 48, h = 33, mode: 'code' | 'diagram' | 'lock' = 'code') {
  rect(ctx, x + w / 2 - 2, y + h, 5, 9, C.metalDark);
  rect(ctx, x + w / 2 - 11, y + h + 7, 23, 4, C.metal);
  panel(ctx, x, y, w, h, '#324b48');
  rect(ctx, x + 5, y + 5, w - 10, h - 12, '#253e39');
  rect(ctx, x + 6, y + 6, w - 12, 3, '#5c7f6f');
  if (mode === 'code') {
    for (let i = 0; i < 4; i++) {
      rect(ctx, x + 9 + (i % 2) * 4, y + 13 + i * 4, 12 + (i % 3) * 6, 2, i % 2 ? '#b8c58b' : '#78a997');
    }
  } else if (mode === 'diagram') {
    line(ctx, [x + 12, y + 17, x + 25, y + 17, x + 25, y + 25, x + 36, y + 25], '#779e83', 1);
    rect(ctx, x + 9, y + 14, 8, 6, '#acc49c');
    rect(ctx, x + 31, y + 21, 9, 6, '#a8b788');
  } else {
    rect(ctx, x + w / 2 - 5, y + 17, 11, 9, '#a7c695');
    line(ctx, [x + w / 2 - 3, y + 17, x + w / 2 - 3, y + 12, x + w / 2 + 3, y + 12, x + w / 2 + 3, y + 17], '#a7c695', 2);
    rect(ctx, x + w / 2, y + 20, 2, 4, C.metalDark);
  }
  rect(ctx, x + w - 8, y + h - 4, 2, 2, '#b8e6a6');
}
function keyboard(ctx: CanvasRenderingContext2D, x: number, y: number, w = 32) {
  rect(ctx, x, y, w, 11, '#79908a');
  rect(ctx, x + 1, y + 1, w - 2, 8, '#c8cdb8');
  for (let yy = y + 2; yy < y + 8; yy += 3) for (let xx = x + 3; xx < x + w - 3; xx += 4) rect(ctx, xx, yy, 2, 1, '#7c8d80');
  rect(ctx, x + 9, y + 8, w - 18, 1, '#77877d');
}
function mug(ctx: CanvasRenderingContext2D, x: number, y: number, color = C.creamLight) {
  rect(ctx, x + 7, y + 2, 4, 5, color);
  rect(ctx, x + 8, y + 3, 2, 3, C.wood);
  rect(ctx, x, y, 8, 10, color);
  rect(ctx, x + 1, y, 6, 2, '#6e5441');
  rect(ctx, x + 1, y + 3, 2, 5, '#ffffff65');
}
function desk(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  shadow(ctx, x, y, w, h);
  rect(ctx, x + 5, y + h - 22, 7, 22, C.metalDark);
  rect(ctx, x + w - 12, y + h - 22, 7, 22, C.metalDark);
  rect(ctx, x + 16, y + h - 20, w - 32, 10, '#af8355');
  wood(ctx, x, y, w, h - 18);
  rect(ctx, x + 2, y + h - 22, w - 4, 6, C.wood);
  rect(ctx, x + 3, y + h - 22, w - 6, 2, '#e6c48b');
}
function toolboard(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  panel(ctx, x, y, w, h, '#b9b49a');
  for (let yy = y + 7; yy < y + h - 3; yy += 8) for (let xx = x + 8; xx < x + w - 4; xx += 8) rect(ctx, xx, yy, 1, 1, '#8d967f');
  for (let i = 0; i < Math.floor((w - 16) / 22); i++) {
    const xx = x + 12 + i * 22;
    if (i % 3 === 0) {
      rect(ctx, xx, y + 13, 3, 20, '#6f7970');
      rect(ctx, xx - 4, y + 9, 12, 6, C.metalDark);
      rect(ctx, xx, y + 27, 4, 9, '#a4774e');
    } else if (i % 3 === 1) {
      line(ctx, [xx - 3, y + 10, xx - 3, y + 17, xx + 4, y + 17, xx + 4, y + 10], '#eff0d8', 3);
      rect(ctx, xx, y + 19, 3, 17, '#e7e5cc');
    } else {
      rect(ctx, xx, y + 10, 2, 16, '#e6e5ce');
      rect(ctx, xx - 2, y + 26, 6, 12, '#ad7754');
    }
  }
}
function windowArch(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  // Stepped arch keeps the room's silhouette in the pixel-art vocabulary.
  poly(ctx, [x, y + 22, x + 8, y + 10, x + 23, y + 2, x + w - 23, y + 2, x + w - 8, y + 10, x + w, y + 22, x + w, y + h, x, y + h], '#8eaa99');
  poly(ctx, [x + 6, y + 24, x + 13, y + 15, x + 26, y + 8, x + w - 26, y + 8, x + w - 13, y + 15, x + w - 6, y + 24, x + w - 6, y + h - 6, x + 6, y + h - 6], '#d7e8d9');
  rect(ctx, x + 7, y + 29, w - 14, h - 36, '#eaf1d8');
  // A distant garden, never external imagery.
  for (let i = 0; i < 5; i++) {
    const xx = x + 9 + i * (w - 20) / 5;
    rect(ctx, xx, y + h - 17 - (i % 2) * 5, (w - 20) / 5, 11 + (i % 2) * 5, '#bacdaa');
  }
  rect(ctx, x + w / 2 - 2, y + 5, 4, h - 7, '#a3b5a0');
  rect(ctx, x + 4, y + 31, w - 8, 4, '#a3b5a0');
  rect(ctx, x - 5, y + h - 2, w + 10, 7, C.creamLight);
  rect(ctx, x - 3, y + h + 5, w + 8, 3, '#a7ae98');
}
function room(ctx: CanvasRenderingContext2D) {
  rect(ctx, 0, 0, WORLD.width, WORLD.height, '#85968c');
  rect(ctx, 24, 53, 1108, 640, '#60786b');
  rect(ctx, 31, 48, 1090, 632, '#aab5a1');
  rect(ctx, 40, 64, 1072, 608, C.floor);
  for (let y = 96; y < 664; y += 32) for (let x = 56; x < 1104; x += 32) {
    // Coordinate hash: stable, cheap and no per-frame randomness.
    const n = ((x * 13 + y * 7) >>> 5) % 11;
    rect(ctx, x, y, 31, 31, n < 3 ? '#d9e0d3' : n > 8 ? '#ced8ca' : C.floor);
    rect(ctx, x, y + 31, 32, 1, C.grout);
    rect(ctx, x + 31, y, 1, 31, '#cbd4c6');
    if (n === 2) rect(ctx, x + 9, y + 12, 2, 1, '#becbbb');
  }
  // Marked circulation: dashed edge lines, never an obstructing object.
  for (let x = 88; x < 1070; x += 32) {
    rect(ctx, x, 352, 13, 2, '#9bae962e');
    rect(ctx, x, 559, 13, 2, '#8d9e8a44');
  }
  for (let y = 118; y < 636; y += 32) {
    rect(ctx, 340, y, 2, 12, '#899c8729');
    rect(ctx, 648, y, 2, 12, '#899c8729');
  }
  // Sunlight cut by the window mullions. Floor is painted first so furniture
  // correctly occludes these warm, low-opacity shafts.
  for (const x of [121, 430, 848]) {
    poly(ctx, [x, 101, x + 96, 101, x + 177, 340, x + 33, 340], '#fff3b925');
    poly(ctx, [x + 46, 102, x + 50, 102, x + 118, 340, x + 112, 340], '#79928010');
  }
  // Cream top wall with stone foot and a real visual extrusion.
  rect(ctx, 40, 38, 1072, 68, C.wallShade);
  rect(ctx, 40, 38, 1072, 56, C.cream);
  rect(ctx, 40, 38, 1072, 5, C.creamLight);
  rect(ctx, 50, 88, 1052, 5, '#ddd7bc');
  rect(ctx, 48, 101, 1056, 7, '#748c7827');
  for (const x of [112, 410, 830]) windowArch(ctx, x, 39, 142, 55);
  for (const x of [58, 306, 660, 1068]) {
    rect(ctx, x, 42, 12, 53, '#d2d0b7');
    rect(ctx, x, 42, 3, 53, '#f7efd9');
    rect(ctx, x - 4, 83, 20, 9, '#ddd7bd');
  }
  // Side walls stay outside the walkable bounds, and expose their inner faces.
  rect(ctx, 40, 94, 16, 578, '#e7e2c9');
  rect(ctx, 53, 103, 7, 560, '#b7bca5');
  rect(ctx, 1096, 94, 16, 578, '#e7e2c9');
  rect(ctx, 1089, 103, 7, 560, '#b7bca5');
  rect(ctx, 40, 661, 1072, 11, '#c1c5ac');
  rect(ctx, 40, 661, 1072, 3, '#e8e4ce');
  // Rafters, conduit and wall-mounted light fixtures.
  rect(ctx, 62, 98, 1026, 5, '#485e5022');
  rect(ctx, 60, 87, 1032, 8, C.woodDark);
  rect(ctx, 60, 87, 1032, 3, '#b19669');
  for (const x of [72, 290, 644, 800, 1080]) {
    rect(ctx, x, 83, 7, 14, '#69786a');
    rect(ctx, x + 2, 87, 2, 2, '#d9d8b6');
  }
  line(ctx, [62, 109, 62, 241, 68, 247, 68, 547], '#8a9a89', 3);
  line(ctx, [1084, 112, 1084, 620], '#8a9a89', 3);
  for (const y of [270, 505]) {
    rect(ctx, 42, y, 12, 25, C.metal);
    rect(ctx, 44, y + 4, 7, 15, '#f4e6ad');
    rect(ctx, 1099, y, 11, 25, C.metal);
    rect(ctx, 1101, y + 4, 7, 15, '#f4e6ad');
  }
  // The front entrance is flat in the floor and does not change collisions.
  rect(ctx, 538, 640, 124, 21, '#b5c3ae');
  for (let x = 544; x < 660; x += 8) rect(ctx, x, 643, 2, 15, '#8fa68f');
  rect(ctx, 540, 660, 120, 3, '#526e61');
  text(ctx, 'WORKSHOP', 600, 625, 12, '#697e6b', 'center');
}
function stationBase(ctx: CanvasRenderingContext2D, station: Station, state: SceneState) {
  const { x, y, w, h } = station.rect;
  // The mat is contained by the station footprint; the entry is clear floor.
  rect(ctx, x - 3, y - 3, w + 6, h + 6, '#60796818');
  rect(ctx, x, y, w, h, station.color + '65');
  rect(ctx, x + 4, y + h - 8, w - 8, 2, station.color);
  for (let xx = x + 6; xx < x + w - 4; xx += 8) rect(ctx, xx, y + h - 5, 3, 1, '#ffffff50');
  const selected = state.selected === station.id;
  if (selected) {
    ctx.save();
    ctx.strokeStyle = '#597d70';
    ctx.lineWidth = 2;
    ctx.setLineDash([7, 5]);
    ctx.strokeRect(x - 5, y - 5, w + 10, h + 10);
    ctx.restore();
  }
  const signWidth = Math.max(118, station.title.length * 8 + 42);
  const sx = x + (w - signWidth) / 2;
  const sy = y - 29;
  rect(ctx, sx + 2, sy + 3, signWidth, 23, '#425d4720');
  rect(ctx, sx, sy, signWidth, 23, C.creamLight);
  rect(ctx, sx, sy, 28, 23, C.ink);
  rect(ctx, sx + 28, sy + 21, signWidth - 28, 2, station.color);
  text(ctx, station.code, sx + 14, sy + 12, 12, '#edf0d9', 'center');
  text(ctx, station.title, sx + 36, sy + 12, 13);
  const { x: ex, y: ey } = station.entry;
  const nearby = state.nearby === station.id;
  // An original engraved entry marker: four corner brackets and a zone code.
  rect(ctx, ex - 19, ey - 12, 38, 24, nearby ? '#eaf0d5' : '#dfe5d6');
  const color = nearby ? C.teal : '#9aa98f';
  for (const [dx, dy, fx, fy] of [[-20, -13, 1, 1], [20, -13, -1, 1], [-20, 13, 1, -1], [20, 13, -1, -1]]) {
    line(ctx, [ex + dx, ey + dy + fy * 6, ex + dx, ey + dy, ex + dx + fx * 7, ey + dy], color, nearby ? 3 : 2);
  }
  text(ctx, station.code, ex, ey + 1, 12, nearby ? '#315e50' : '#748872', 'center');
}
function assembly(ctx: CanvasRenderingContext2D, state: SceneState) {
  // Back storage rack and small bins.
  panel(ctx, 381, 155, 229, 35, '#b1bd9b');
  for (let i = 0; i < 7; i++) {
    rect(ctx, 389 + i * 30, 160, 24, 21, i % 2 ? '#839983' : '#a5ad82');
    rect(ctx, 392 + i * 30, 167, 17, 6, '#ece7cc');
    rect(ctx, 398 + i * 30, 169, 6, 1, '#8a9278');
  }
  desk(ctx, 378, 204, 236, 83);
  // Two work monitors, a copper task light, papers, and a physical prototype.
  monitor(ctx, 405, 192, 57, 40, 'diagram');
  monitor(ctx, 475, 196, 49, 35);
  keyboard(ctx, 413, 248, 44);
  keyboard(ctx, 479, 248, 38);
  lamp(ctx, 588, 249);
  rect(ctx, 544, 230, 23, 17, '#f4efd7');
  line(ctx, [549, 235, 562, 235, 562, 241, 550, 241], '#92a28c', 1);
  mug(ctx, 534, 256, '#7f9c7c');
  // A circuit-like prototype on the workbench, not simulated review data.
  panel(ctx, 550, 256, 39, 18, '#6f9474');
  rect(ctx, 564, 261, 12, 7, '#425f50');
  for (let i = 0; i < 4; i++) rect(ctx, 554 + i * 8, 258, 2, 2, '#e8d294');
  reviewSign(ctx, 394, 173, 194, state, false);
}
function security(ctx: CanvasRenderingContext2D, state: SceneState) {
  panel(ctx, 1001, 151, 29, 103, '#748d83');
  for (let y = 160; y < 244; y += 17) {
    panel(ctx, 1005, y, 21, 13, '#4e6761');
    for (let x = 1009; x < 1022; x += 4) rect(ctx, x, y + 6, 2, 1, '#a1ba96');
    rect(ctx, 1021, y + 3, 2, 2, '#c2d8a2');
  }
  line(ctx, [1012, 254, 1012, 277, 987, 277, 987, 224], '#617f70', 3);
  desk(ctx, 874, 191, 118, 96);
  monitor(ctx, 886, 177, 67, 43, 'lock');
  keyboard(ctx, 895, 239, 46);
  mug(ctx, 961, 248, '#d4c99f');
  panel(ctx, 951, 213, 26, 16, '#a1b49b');
  rect(ctx, 960, 218, 8, 5, C.teal);
  reviewSign(ctx, 873, 150, 120, state, true);
  plant(ctx, 1012, 287, .62);
}
function reviewSign(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, state: SceneState, securityOnly: boolean) {
  panel(ctx, x, y, w, 19, '#405e52');
  if (!state.hasAccess) {
    // No review-derived text, count or status hue leaks into a denied view.
    text(ctx, 'RESTRICTED', x + w / 2, y + 10, 10, '#e4e9d1', 'center');
    return;
  }
  const labels: Record<string, string> = {
    draft: 'Draft', in_review: 'In review', 'in-review': 'In review',
    approved: 'Approved', changes_requested: 'Changes requested',
    'changes-requested': 'Changes requested', pending: 'Pending',
  };
  // Only known short states are displayed: arbitrary protected prose is not a
  // canvas label. Parent UI supplies the full review details accessibly.
  const label = labels[state.reviewState] ?? 'Review';
  const pending = Math.max(0, Math.min(99, Math.floor(Number.isFinite(state.pending) ? state.pending : 0)));
  const value = securityOnly ? `Review · ${pending} pending` : `${label} · ${pending} pending`;
  text(ctx, value, x + w / 2, y + 10, securityOnly ? 9 : 10, '#dce6c5', 'center');
}
function maintainability(ctx: CanvasRenderingContext2D) {
  toolboard(ctx, 105, 388, 107, 45);
  // Parts drawers with tiny metal pulls.
  panel(ctx, 257, 390, 53, 50, '#9aa98a');
  for (let y = 399; y < 434; y += 12) {
    rect(ctx, 262, y, 43, 9, '#80937d');
    rect(ctx, 279, y + 3, 9, 2, '#e5debd');
  }
  desk(ctx, 104, 437, 205, 38);
  monitor(ctx, 213, 403, 40, 29, 'code');
  keyboard(ctx, 216, 446, 33);
  rect(ctx, 129, 443, 43, 14, '#647867');
  line(ctx, [138, 446, 155, 446, 155, 453, 140, 453], '#c6cca5', 2);
  rect(ctx, 178, 442, 4, 14, '#6e7d70');
  rect(ctx, 174, 441, 12, 4, '#bcc7af');
  mug(ctx, 271, 446);
}
function growth(ctx: CanvasRenderingContext2D) {
  // Seedling shelves lend "Growth" an identity without inventing metrics.
  panel(ctx, 712, 388, 154, 27, '#b6b898');
  for (let i = 0; i < 5; i++) plant(ctx, 726 + i * 30, 411, .35);
  desk(ctx, 713, 430, 154, 44);
  monitor(ctx, 748, 410, 45, 30, 'diagram');
  keyboard(ctx, 754, 449, 34);
  rect(ctx, 805, 437, 20, 17, '#ecdfbc');
  rect(ctx, 808, 439, 2, 13, '#bbaa89');
  line(ctx, [813, 442, 821, 442, 821, 449, 813, 449], '#93a689', 1);
  mug(ctx, 829, 449, '#aab689');
}
function economics(ctx: CanvasRenderingContext2D) {
  desk(ctx, 937, 420, 108, 59);
  monitor(ctx, 951, 400, 47, 32, 'diagram');
  keyboard(ctx, 958, 446, 33);
  // Ledger, calculator and brass desk lamp are objects, not financial values.
  rect(ctx, 1005, 437, 23, 18, '#f0e5c2');
  rect(ctx, 1015, 438, 1, 15, '#c5b48d');
  for (let y = 441; y < 453; y += 4) rect(ctx, 1008, y, 6, 1, '#b3aa89');
  panel(ctx, 1009, 460, 17, 11, '#8b9983');
  for (let x = 1012; x < 1024; x += 4) rect(ctx, x, 466, 2, 2, '#e0dbb7');
  mug(ctx, 935, 451, '#d2b575');
}
function nook(ctx: CanvasRenderingContext2D) {
  // Reception: all solid pieces stay inside x80..272, y112..208.
  panel(ctx, 85, 113, 83, 28, '#a0ac91');
  for (let i = 0; i < 8; i++) {
    rect(ctx, 92 + i * 9, 117 + i % 3, 6, 19 - i % 3, ['#b78b64', '#7d9a82', '#d2bd8e'][i % 3]);
    rect(ctx, 94 + i * 9, 120, 2, 8, '#eee6c2');
  }
  desk(ctx, 87, 153, 170, 49);
  monitor(ctx, 110, 140, 39, 27, 'diagram');
  keyboard(ctx, 112, 176, 29);
  rect(ctx, 166, 168, 31, 18, '#f0ead2');
  rect(ctx, 168, 171, 3, 12, '#c2b187');
  rect(ctx, 175, 172, 17, 1, '#a3ad92');
  mug(ctx, 208, 176);
  plant(ctx, 241, 184, .58);
  text(ctx, 'RECEPTION', 181, 130, 11, '#4a6255');
}
function machine(ctx: CanvasRenderingContext2D) {
  shadow(ctx, 676, 151, 103, 99);
  panel(ctx, 679, 148, 98, 84, '#8ea28d');
  panel(ctx, 692, 154, 57, 44, '#647d71');
  rect(ctx, 698, 159, 45, 32, '#334e45');
  rect(ctx, 714, 161, 10, 24, '#9caf9b');
  rect(ctx, 706, 183, 31, 6, '#bdc69f');
  rect(ctx, 718, 163, 2, 14, '#e8d5a5');
  rect(ctx, 756, 161, 10, 19, '#dae4b3');
  rect(ctx, 758, 164, 6, 3, C.teal);
  rect(ctx, 758, 171, 6, 3, '#b5bc8c');
  for (let y = 190; y < 222; y += 5) rect(ctx, 755, y, 12, 2, '#536c60');
  // A short roller conveyor, fully in the machine's collision footprint.
  panel(ctx, 682, 208, 66, 43, '#6b8176');
  for (let y = 212; y < 245; y += 6) {
    rect(ctx, 687, y, 54, 4, '#aab5a2');
    rect(ctx, 689, y, 50, 1, '#d1d6b9');
  }
  crate(ctx, 700, 219, 29, 20);
  rect(ctx, 759, 232, 8, 17, C.metalDark);
  rect(ctx, 678, 250, 95, 4, '#4b6256');
}
function coffee(ctx: CanvasRenderingContext2D) {
  desk(ctx, 439, 430, 113, 61);
  panel(ctx, 450, 420, 38, 42, '#c6c8b1');
  panel(ctx, 455, 424, 28, 12, '#536c62');
  rect(ctx, 460, 427, 13, 3, '#bbd19d');
  rect(ctx, 459, 440, 21, 16, '#40584e');
  rect(ctx, 468, 439, 4, 6, '#d1d8bf');
  mug(ctx, 465, 446);
  rect(ctx, 451, 459, 36, 3, '#72867a');
  rect(ctx, 498, 444, 22, 19, '#e1d3b1');
  rect(ctx, 500, 441, 18, 5, '#a58260');
  mug(ctx, 524, 457, '#c6b580');
  rect(ctx, 504, 475, 32, 6, '#d8c191');
  plant(ctx, 537, 439, .48);
}
function lounge(ctx: CanvasRenderingContext2D) {
  shadow(ctx, 52, 576, 103, 66);
  rect(ctx, 56, 631, 7, 14, C.woodDark);
  rect(ctx, 143, 631, 7, 14, C.woodDark);
  rect(ctx, 53, 572, 101, 61, '#647c64');
  rect(ctx, 57, 572, 93, 23, '#839875');
  rect(ctx, 58, 574, 91, 3, '#a8b08b');
  rect(ctx, 61, 597, 41, 29, '#93a081');
  rect(ctx, 105, 597, 41, 29, '#93a081');
  rect(ctx, 63, 600, 36, 2, '#b3bb96');
  rect(ctx, 108, 600, 34, 2, '#b3bb96');
  rect(ctx, 51, 587, 11, 43, '#718969');
  rect(ctx, 145, 587, 11, 43, '#718969');
  rect(ctx, 65, 583, 23, 16, '#d5be90');
  rect(ctx, 67, 585, 18, 2, '#e6d1a3');
  rect(ctx, 118, 589, 19, 12, '#b0b5a3');
  rect(ctx, 121, 591, 13, 1, '#d7d9c3');
}
function human(ctx: CanvasRenderingContext2D, id: HumanId, x: number, y: number, facing: Facing, step: number) {
  const p = PALETTES[id];
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  const side = facing === 'left' || facing === 'right';
  const up = facing === 'up';
  const right = facing === 'right';
  // Pixel shoes and two independently walking legs; all positions use feet.
  rect(ctx, -8, -15, 6, 12 + step, p.pants);
  rect(ctx, 3, -15, 6, 12 - step, p.pants);
  rect(ctx, -9, -5 + step, 8, 5, '#2e403b');
  rect(ctx, 3, -5 - step, 9, 5, '#2e403b');
  rect(ctx, -8, -4 + step, 5, 1, '#a3ae98');
  rect(ctx, 4, -4 - step, 5, 1, '#a3ae98');
  rect(ctx, -10, -31, 21, 20, p.shirt);
  rect(ctx, -7, -32, 15, 3, p.light);
  rect(ctx, -8, -29, 4, 15, p.light);
  rect(ctx, -13, -27 + step, 5, 12, p.shirt);
  rect(ctx, 10, -27 - step, 5, 12, p.shirt);
  rect(ctx, -13, -17 + step, 4, 5, p.skin);
  rect(ctx, 11, -17 - step, 4, 5, p.skin);
  rect(ctx, -2, -35, 6, 6, p.shade);
  rect(ctx, -8, -46, 17, 14, p.skin);
  rect(ctx, -10, -44, 3, 8, p.shade);
  rect(ctx, -8, -49, 17, 7, p.hair);
  rect(ctx, -10, -46, 4, 10, p.hair);
  if (id === 'maya') {
    rect(ctx, -11, -43, 5, 13, p.hair);
    rect(ctx, 7, -43, 4, 14, p.hair);
    rect(ctx, -8, -50, 10, 3, '#534032');
  } else if (id === 'river') {
    rect(ctx, -8, -51, 13, 4, p.hair);
    rect(ctx, 6, -47, 5, 5, p.hair);
  } else {
    rect(ctx, -5, -48, 10, 3, '#b08653');
  }
  if (up) {
    rect(ctx, -7, -44, 15, 10, p.hair);
    rect(ctx, -5, -26, 11, 10, p.shirt);
    rect(ctx, -3, -24, 6, 2, p.light);
  } else if (side) {
    const dx = right ? 7 : -8;
    rect(ctx, dx, -41, 2, 2, '#303b33');
    rect(ctx, right ? 9 : -11, -39, 3, 3, p.skin);
    rect(ctx, right ? 6 : -7, -35, 3, 1, p.shade);
    rect(ctx, right ? -4 : 4, -29, 4, 15, p.light);
  } else {
    rect(ctx, -4, -40, 2, 2, '#2e3931');
    rect(ctx, 4, -40, 2, 2, '#2e3931');
    rect(ctx, 0, -35, 3, 1, p.shade);
    rect(ctx, 2, -27, 5, 6, '#d9d6b6');
    rect(ctx, 3, -26, 3, 2, '#759a7f');
  }
  rect(ctx, -9, -12, 20, 2, '#4c5040');
  ctx.restore();
}
function robot(ctx: CanvasRenderingContext2D, x: number, y: number, facing: Facing, step: number) {
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  rect(ctx, -9, -11, 6, 9 + step, '#6c827b');
  rect(ctx, 3, -11, 6, 9 - step, '#6c827b');
  rect(ctx, -11, -4 + step, 9, 4, C.metalDark);
  rect(ctx, 3, -4 - step, 9, 4, C.metalDark);
  panel(ctx, -11, -30, 23, 21, '#6aa795');
  rect(ctx, -7, -25, 14, 9, '#c4d0bc');
  rect(ctx, -3, -22, 6, 3, '#759887');
  rect(ctx, -16, -27 + step, 5, 13, '#96afa4');
  rect(ctx, 12, -27 - step, 5, 13, '#96afa4');
  rect(ctx, -16, -15 + step, 5, 4, C.metalDark);
  rect(ctx, 12, -15 - step, 5, 4, C.metalDark);
  rect(ctx, -2, -35, 5, 6, C.metalDark);
  panel(ctx, -13, -48, 27, 17, '#a7c0b4');
  rect(ctx, -10, -44, 21, 8, '#34594f');
  if (facing === 'up') {
    rect(ctx, -9, -44, 19, 8, '#99afa4');
    rect(ctx, -4, -42, 9, 2, '#5c7b6f');
  } else if (facing === 'left' || facing === 'right') {
    rect(ctx, facing === 'left' ? -8 : 6, -42, 3, 3, '#d1edb1');
  } else {
    rect(ctx, -7, -42, 4, 3, '#d1edb1');
    rect(ctx, 5, -42, 4, 3, '#d1edb1');
  }
  rect(ctx, 0, -54, 2, 7, C.metalDark);
  rect(ctx, -1, -57, 4, 4, '#d0bd7a');
  rect(ctx, -16, -43, 3, 7, C.teal);
  rect(ctx, 14, -43, 3, 7, C.teal);
  ctx.restore();
}
function footShadow(ctx: CanvasRenderingContext2D, x: number, y: number) {
  rect(ctx, x - 15, y - 3, 30, 7, '#365a4321');
  rect(ctx, x - 10, y - 5, 20, 10, '#365a4318');
}
function halo(ctx: CanvasRenderingContext2D, x: number, y: number) {
  // An octagonal teal/olive selection ring, rather than a circle-as-character.
  const points = [x - 20, y - 6, x - 11, y - 12, x + 11, y - 12, x + 20, y - 6, x + 20, y + 6, x + 11, y + 12, x - 11, y + 12, x - 20, y + 6];
  poly(ctx, points, '#6a977b26');
  line(ctx, [...points, points[0], points[1]], '#527c62', 2);
  line(ctx, [x - 17, y + 7, x - 10, y + 11, x + 10, y + 11, x + 17, y + 7], '#a1b16e', 2);
}
function destination(ctx: CanvasRenderingContext2D, point: Point) {
  const x = Math.round(point.x), y = Math.round(point.y);
  line(ctx, [x, y - 9, x + 12, y, x, y + 9, x - 12, y, x, y - 9], '#4b8b77', 2);
  line(ctx, [x - 19, y, x - 14, y], '#4b8b77', 2);
  line(ctx, [x + 14, y, x + 19, y], '#4b8b77', 2);
  rect(ctx, x - 2, y - 2, 4, 4, '#6d967d');
}

/** Paint one deterministic workshop frame, preserving the caller's transform. */
export function drawFactory(ctx: CanvasRenderingContext2D, state: SceneState): void {
  ctx.save();
  try {
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.imageSmoothingEnabled = false;
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    ctx.setLineDash([]);
    ctx.lineCap = 'butt';
    ctx.lineJoin = 'miter';
    room(ctx);
    for (const station of STATIONS) stationBase(ctx, station, state);
    if (state.destination) destination(ctx, state.destination);

    // Depth-sort standing characters together with the solid furniture fronts.
    // Most NPCs stay tucked beside their desk, leaving marked entry points open.
    const layers: { y: number; draw: () => void }[] = [
      { y: 208, draw: () => nook(ctx) },
      { y: 256, draw: () => machine(ctx) },
      { y: 296, draw: () => assembly(ctx, state) },
      { y: 296, draw: () => security(ctx, state) },
      { y: 480, draw: () => maintainability(ctx) },
      { y: 480, draw: () => growth(ctx) },
      { y: 488, draw: () => economics(ctx) },
      { y: 496, draw: () => coffee(ctx) },
      { y: 648, draw: () => lounge(ctx) },
    ];
    const npcs: { id: HumanId | 'robot'; x: number; y: number; facing: Facing }[] = [
      { id: 'maya', x: 398, y: 322, facing: 'right' },
      { id: 'alex', x: 1026, y: 320, facing: 'left' },
      { id: 'river', x: 122, y: 514, facing: 'right' },
      { id: 'robot', x: 288, y: 261, facing: 'down' },
      { id: 'robot', x: 850, y: 518, facing: 'left' },
    ];
    const principal = state.principalId in PALETTES ? state.principalId as HumanId : 'observer';
    npcs.forEach((npc, index) => {
      if (npc.id === principal) return;
      // A tiny head/body idle shift, not fictitious activity or live presence.
      const idle = !state.reducedMotion && Math.sin(state.time / 1300 + index * 2) > .92 ? -1 : 0;
      layers.push({ y: npc.y, draw: () => {
        footShadow(ctx, npc.x, npc.y);
        if (npc.id === 'robot') robot(ctx, npc.x, npc.y + idle, npc.facing, 0);
        else {
          human(ctx, npc.id, npc.x, npc.y + idle, npc.facing, 0);
          text(ctx, npc.id[0].toUpperCase() + npc.id.slice(1), npc.x, npc.y - 62, 11, '#4c6256', 'center');
        }
      } });
    });
    const px = Math.round(state.player.x), py = Math.round(state.player.y);
    const step = state.moving && !state.reducedMotion ? (Math.floor(state.time / 130) % 2 ? 2 : -2) : 0;
    layers.push({ y: py, draw: () => {
      halo(ctx, px, py);
      footShadow(ctx, px, py);
      if (principal === 'observer') robot(ctx, px, py, state.facing, step);
      else human(ctx, principal, px, py, state.facing, step);
    } });
    layers.sort((a, b) => a.y - b.y).forEach(layer => layer.draw());
    // Player label on top of all sprites, so it remains locatable near furniture.
    rect(ctx, px - 18, py - 73, 36, 17, '#f5f1db');
    rect(ctx, px - 18, py - 57, 36, 2, C.teal);
    text(ctx, 'You', px, py - 64, 11, '#315c4e', 'center');
    poly(ctx, [px - 3, py - 55, px + 3, py - 55, px, py - 52], C.teal);
    // This badge is the only scene detail affected by source availability.
    if (!state.sourceAvailable) {
      rect(ctx, 960, 605, 110, 25, '#f0dfb7');
      rect(ctx, 960, 605, 3, 25, '#ac864f');
      text(ctx, '! Source offline', 1017, 618, 10, '#695333', 'center');
    }
  } finally {
    ctx.restore();
  }
}
