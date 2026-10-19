// Handwritten signature: strokes -> SVG (the original) -> WebP (what is displayed)
export type Point = { x: number; y: number };

export const SIGNATURE_WIDTH = 600;
export const SIGNATURE_HEIGHT = 240;

const SVG_HEAD =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIGNATURE_WIDTH} ${SIGNATURE_HEIGHT}" width="${SIGNATURE_WIDTH}" height="${SIGNATURE_HEIGHT}">` +
    '<g fill="none" stroke="#111" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">';
const SVG_TAIL = '</g></svg>';
const PATH = '<path d="[MLQ0-9\\s.,-]*"/>';
const SVG_PATTERN = new RegExp('^' + SVG_HEAD.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?:' + PATH + ')*' + SVG_TAIL + '$');

const r = (n: number) => Math.round(n * 10) / 10;

function strokeToPath(points: Point[]): string {
    if (points.length === 1) return `M${r(points[0].x)} ${r(points[0].y)}L${r(points[0].x + 0.1)} ${r(points[0].y)}`;
    let d = `M${r(points[0].x)} ${r(points[0].y)}`;
    for (let i = 1; i < points.length - 1; i++) {
        const mx = (points[i].x + points[i + 1].x) / 2;
        const my = (points[i].y + points[i + 1].y) / 2;
        d += `Q${r(points[i].x)} ${r(points[i].y)} ${r(mx)} ${r(my)}`;
    }
    const last = points[points.length - 1];
    return d + `L${r(last.x)} ${r(last.y)}`;
}

export function strokesToSvg(strokes: Point[][]): string {
    const paths = strokes.filter((s) => s.length > 0).map((s) => `<path d="${strokeToPath(s)}"/>`);
    return SVG_HEAD + paths.join('') + SVG_TAIL;
}

/** Only SVG produced by strokesToSvg is accepted (no scripts, no external references) */
export function isValidSignatureSvg(svg: unknown): svg is string {
    return typeof svg === 'string' && svg.length <= 200_000 && SVG_PATTERN.test(svg);
}

export function isValidSignatureWebp(webp: unknown): webp is string {
    return typeof webp === 'string' && webp.length <= 400_000 && /^data:image\/webp;base64,[A-Za-z0-9+/]+=*$/.test(webp);
}

/** Browser only: render the SVG original to a WebP data URL */
export async function svgToWebp(svg: string): Promise<string> {
    const img = new Image();
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = SIGNATURE_WIDTH * 2;
    canvas.height = SIGNATURE_HEIGHT * 2;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas unavailable');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const webp = canvas.toDataURL('image/webp', 0.92);
    if (!webp.startsWith('data:image/webp')) throw new Error('webp unsupported');
    return webp;
}
