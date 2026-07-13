const { getAppDb } = require('../database');

const PROJECT_COLOR_PALETTE = [
  '#8B5CF6', '#14B8A6', '#EC4899', '#F59E0B', '#10B981', '#6366F1',
  '#06B6D4', '#F43F5E', '#84CC16', '#A855F7', '#0EA5E9', '#EAB308',
  '#22C55E', '#3B82F6', '#D946EF', '#EF4444', '#F97316', '#65A30D',
  '#0891B2', '#7C3AED', '#DB2777', '#0D9488', '#4F46E5', '#CA8A04',
  '#FDE68A', '#FEF3C7', '#FCD34D', '#FBBF24', '#FCA5A5', '#FECACA',
  '#FDBA74', '#FED7AA', '#BBF7D0', '#86EFAC', '#A7F3D0', '#5EEAD4',
  '#BAE6FD', '#7DD3FC', '#C4B5FD', '#DDD6FE', '#FBCFE8', '#F9A8D4',
  '#E9D5FF', '#D8B4FE', '#BFDBFE', '#93C5FD', '#D9F99D', '#BEF264',
  '#E5E7EB', '#CBD5E1', '#94A3B8', '#64748B',
];

function hslToHex(hueValue, saturationValue, lightnessValue) {
  const hue = ((Number(hueValue) % 360) + 360) % 360;
  const saturation = Math.max(0, Math.min(100, Number(saturationValue))) / 100;
  const lightness = Math.max(0, Math.min(100, Number(lightnessValue))) / 100;
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const x = chroma * (1 - Math.abs((hue / 60) % 2 - 1));
  const match = lightness - chroma / 2;
  let red = 0, green = 0, blue = 0;

  if (hue < 60) [red, green, blue] = [chroma, x, 0];
  else if (hue < 120) [red, green, blue] = [x, chroma, 0];
  else if (hue < 180) [red, green, blue] = [0, chroma, x];
  else if (hue < 240) [red, green, blue] = [0, x, chroma];
  else if (hue < 300) [red, green, blue] = [x, 0, chroma];
  else [red, green, blue] = [chroma, 0, x];

  const toHex = value => Math.round((value + match) * 255).toString(16).padStart(2, '0');
  return `#${toHex(red)}${toHex(green)}${toHex(blue)}`.toUpperCase();
}

function projectColorForIndex(index) {
  const normalized = Math.max(0, Math.trunc(Number(index) || 0));
  if (normalized < PROJECT_COLOR_PALETTE.length) return PROJECT_COLOR_PALETTE[normalized];
  const hue = (normalized * 137.508) % 360;
  return hslToHex(hue, 72, normalized % 2 === 0 ? 46 : 56);
}

function assignUniqueProjectColors(projectIds = null) {
  const db = getAppDb();
  const rows = projectIds?.length
    ? db.prepare(`SELECT id FROM projects WHERE id IN (${projectIds.map(() => '?').join(',')}) ORDER BY id`).all(...projectIds)
    : db.prepare('SELECT id FROM projects ORDER BY id').all();
  if (!rows.length) return 0;

  const update = db.prepare('UPDATE projects SET color=? WHERE id=?');
  return db.transaction(items => {
    items.forEach((row, index) => update.run(projectColorForIndex(index), row.id));
    return items.length;
  })(rows);
}

module.exports = { assignUniqueProjectColors, hslToHex, projectColorForIndex, PROJECT_COLOR_PALETTE };
