// Seal (stamp) SVG: the same small static dialect PapeRobo's stamps use (src/lib/svgStamp.ts there). Keep the two in sync.
// No script, CSS, links, foreignObject, embedded images, animation or external resources.
export const MAX_STAMP_BYTES = 64000;
const elements = new Set('svg g path rect circle ellipse line polyline polygon text tspan defs linearGradient radialGradient stop clipPath title desc'.split(' '));
const attributes = new Set('xmlns viewBox width height x y x1 y1 x2 y2 cx cy r rx ry d points fill fill-opacity stroke stroke-width stroke-linecap stroke-linejoin stroke-opacity opacity transform id offset stop-color stop-opacity gradientUnits gradientTransform spreadMethod fx fy fr clip-path font-family font-size font-weight text-anchor dominant-baseline dx dy rotate fill-rule clip-rule stroke-dasharray stroke-dashoffset stroke-miterlimit letter-spacing font-style textLength lengthAdjust'.split(' '));
export function isValidStampSvg(value: unknown): value is string {
 if (typeof value !== 'string' || !value || new TextEncoder().encode(value).length > MAX_STAMP_BYTES || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]|<!|<\?/.test(value)) return false;
 const source = value.trim();
 const stack: string[] = []; let pos = 0; let roots = 0; let count = 0;
 const tokens = /<([^<>]+)>/g; let match: RegExpExecArray | null;
 while ((match = tokens.exec(source))) {
  const text = source.slice(pos, match.index);
  if (/[<>]/.test(text) || /&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[\da-fA-F]+);)/.test(text) || (!stack.length && text.trim())) return false;
  pos = tokens.lastIndex;
  const tag = match[1];
  if (tag.startsWith('/')) { if (!/^\/[A-Za-z]+\s*$/.test(tag) || stack.pop() !== tag.slice(1).trim()) return false; continue; }
  const name = /^([A-Za-z]+)(?=\s|\/|$)/.exec(tag)?.[1];
  if (!name || !elements.has(name) || ++count > 1500 || stack.length > 32) return false;
  if (!stack.length) { if (name !== 'svg' || ++roots !== 1) return false; } else if (name === 'svg') return false;
  let rest = tag.slice(name.length).replace(/\/\s*$/, ''); const seen = new Set<string>();
  const values: Record<string, string> = {};
  while (rest.trim()) {
   const a = /^\s+([A-Za-z][\w-]*)\s*=\s*(["'])(.*?)\2/s.exec(rest);
   if (!a || !attributes.has(a[1]) || seen.has(a[1]) || (/[<>&\\]|javascript:|data:|https?:|\/\//i.test(a[3]) && a[1] !== 'xmlns')) return false;
   seen.add(a[1]); values[a[1]] = a[3]; rest = rest.slice(a[0].length);
   if (/url\s*\(/i.test(a[3]) && !/^url\(#[A-Za-z][\w-]*\)$/.test(a[3])) return false;
   if (a[1] === 'xmlns' && a[3] !== 'http://www.w3.org/2000/svg') return false;
  }
  if (name === 'svg' && (values.viewBox !== '0 0 320 320' || values.xmlns !== 'http://www.w3.org/2000/svg')) return false;
  if (!/\/\s*$/.test(tag)) stack.push(name);
 }
 return roots === 1 && !stack.length && !source.slice(pos).trim();
}
