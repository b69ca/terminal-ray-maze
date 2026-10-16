const size = 21, tau = Math.PI * 2;
export function createWorld({ seed = 42, width = 80, height = 30 } = {}) {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error('seed must be unsigned 32-bit');
  if (!Number.isInteger(width) || width < 40 || width > 120 || !Number.isInteger(height) || height < 18 || height > 60) throw new Error('width must be 40–120 and height 18–60');
  let rng = seed; const random = () => { rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0; return rng / 4294967296; };
  const cells = new Uint8Array(size * size).fill(1), stack = [[1, 1]]; cells[size + 1] = 0;
  while (stack.length) {
    const [x, y] = stack.at(-1), choices = [[2, 0], [-2, 0], [0, 2], [0, -2]].filter(([dx, dy]) => x + dx > 0 && x + dx < size - 1 && y + dy > 0 && y + dy < size - 1 && cells[(y + dy) * size + x + dx]);
    if (!choices.length) { stack.pop(); continue; }
    const [dx, dy] = choices[Math.floor(random() * choices.length)]; cells[(y + dy / 2) * size + x + dx / 2] = 0; cells[(y + dy) * size + x + dx] = 0; stack.push([x + dx, y + dy]);
  }
  // Start in an open corridor, looking along its first passage.
  return { seed, width, height, size, cells, x: 1.5, y: 1.5, angle: cells[size + 2] === 0 ? 0 : Math.PI / 2, frame: 0 };
}
export function turn(world, radians) {
  if (!Number.isFinite(radians)) throw new Error('turn must be finite');
  world.angle = ((world.angle + radians) % tau + tau) % tau; return world;
}
export function move(world, distance) {
  if (!Number.isFinite(distance) || Math.abs(distance) > 10) throw new Error('move distance must be between -10 and 10');
  const free = (x, y) => { for (const dx of [-0.18, 0.18]) for (const dy of [-0.18, 0.18]) { const cx = Math.floor(x + dx), cy = Math.floor(y + dy); if (cx < 0 || cy < 0 || cx >= size || cy >= size || world.cells[cy * size + cx]) return false; } return true; };
  const n = Math.max(1, Math.ceil(Math.abs(distance) / 0.05)), dx = Math.cos(world.angle) * distance / n, dy = Math.sin(world.angle) * distance / n;
  for (let i = 0; i < n; i++) { if (free(world.x + dx, world.y)) world.x += dx; if (free(world.x, world.y + dy)) world.y += dy; }
  return world;
}
export function step(world, count = 1) {
  if (!Number.isInteger(count) || count < 0 || count > 10000) throw new Error('step count must be 0–10000');
  for (let i = 0; i < count; i++) { turn(world, 0.025); world.frame++; } return world;
}
export function castRay(world, angle) {
  if (!Number.isFinite(angle)) throw new Error('ray angle must be finite');
  const dx = Math.cos(angle), dy = Math.sin(angle); let x = Math.floor(world.x), y = Math.floor(world.y);
  const sx = dx < 0 ? -1 : 1, sy = dy < 0 ? -1 : 1, deltaX = Math.abs(1 / dx), deltaY = Math.abs(1 / dy);
  let nextX = (dx < 0 ? world.x - x : x + 1 - world.x) * deltaX, nextY = (dy < 0 ? world.y - y : y + 1 - world.y) * deltaY;
  for (let n = 0; n < size * 4; n++) {
    let distance, side;
    if (nextX < nextY) { distance = nextX; nextX += deltaX; x += sx; side = 0; } else { distance = nextY; nextY += deltaY; y += sy; side = 1; }
    if (x < 0 || y < 0 || x >= size || y >= size || world.cells[y * size + x]) return { distance, side, x, y };
  }
  throw new Error('ray escaped bounded maze');
}
export function analyze(world) { return { seed: world.seed, frame: world.frame, mazeSize: size, passageCells: world.cells.reduce((n, c) => n + (c === 0), 0), player: { x: world.x, y: world.y, angle: world.angle }, frontDistance: castRay(world, world.angle).distance }; }
function columns(world, count) {
  return Array.from({ length: count }, (_, x) => { const offset = Math.atan((2 * (x + 0.5) / count - 1) * Math.tan(Math.PI / 6)), ray = castRay(world, world.angle + offset); return { ...ray, depth: Math.max(0.05, ray.distance * Math.cos(offset)) }; });
}
export function render(world, { color = false, map = false } = {}) {
  const { width: w, height: h } = world, rows = Array.from({ length: h }, (_, y) => Array(w).fill(y < h / 2 ? ' ' : '.'));
  columns(world, w).forEach((r, x) => { const wallH = h / r.depth, top = Math.max(0, Math.ceil(h / 2 - wallH / 2)), bottom = Math.min(h - 1, Math.floor(h / 2 + wallH / 2)), ch = r.depth < 1.5 ? '#' : r.depth < 3 ? 'O' : r.depth < 6 ? '+' : ':'; for (let y = top; y <= bottom; y++) rows[y][x] = color ? `\x1b[${r.side ? 34 : 36}m${ch}\x1b[0m` : ch; });
  if (map) for (let y = 0; y < Math.min(size, h); y++) for (let x = 0; x < size; x++) rows[y][x] = Math.floor(world.x) === x && Math.floor(world.y) === y ? '@' : world.cells[y * size + x] ? '#' : ' ';
  return rows.map(row => row.join('')).join('\n');
}
export function renderSVG(world) {
  let walls = '', map = ''; const rays = columns(world, 240);
  rays.forEach((r, x) => { const wallH = Math.min(350, 270 / r.depth), light = Math.max(14, 65 - r.depth * 6 - r.side * 12); walls += `<rect x="${28 + x * 2.1}" y="${275 - wallH / 2}" width="2.2" height="${wallH}" fill="hsl(185,65%,${light}%)"/>`; });
  world.cells.forEach((v, i) => { if (v) map += `<rect x="${552 + i % size * 10}" y="${135 + Math.floor(i / size) * 10}" width="10" height="10" fill="#293b52"/>`; });
  const px = 552 + world.x * 10, py = 135 + world.y * 10;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="510" viewBox="0 0 800 510"><rect width="800" height="510" rx="18" fill="#0d1525"/><g font-family="monospace"><text x="28" y="38" font-size="24" fill="#eff5ff">TERMINAL RAY MAZE</text><text x="28" y="65" fill="#93a4bc">seed ${world.seed} / 60-degree field of view / frame ${world.frame}</text><rect x="28" y="100" width="504" height="175" fill="#15263b"/><rect x="28" y="275" width="504" height="175" fill="#1b2838"/>${walls}${map}<circle cx="${px}" cy="${py}" r="4" fill="#ffd166"/><path d="M${px} ${py}l${Math.cos(world.angle) * 14} ${Math.sin(world.angle) * 14}" stroke="#ffd166" stroke-width="2"/><text x="552" y="380" fill="#93a4bc">21 × 21 maze</text><text x="28" y="486" font-size="13" fill="#93a4bc">w/s walk / a/d turn / m map / p spin / n seed / r reset / q quit</text></g></svg>\n`;
}
