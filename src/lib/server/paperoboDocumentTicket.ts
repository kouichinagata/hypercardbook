import { createHmac, timingSafeEqual } from 'node:crypto';
export type DocumentTicket = { id: string; selectedBy: string; purpose: 'cover' | 'preview'; expires: number };
const mac = (value: string, secret: string) => createHmac('sha256', secret).update('paperobo-preview-v1:' + value).digest('base64url');
export function signDocumentTicket(value: DocumentTicket, secret: string) {
    if (!secret) throw new Error('Integration is not configured.');
    const payload = Buffer.from(JSON.stringify(value)).toString('base64url');
    return payload + '.' + mac(payload, secret);
}
export function verifyDocumentTicket(token: string, secret: string, purpose: DocumentTicket['purpose'], now = Date.now()): DocumentTicket | null {
    if (!secret || token.length > 2048) return null;
    const [payload, signature, extra] = token.split('.');
    if (!payload || !signature || extra) return null;
    const expected = Buffer.from(mac(payload, secret)); const actual = Buffer.from(signature);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
    try {
        const value = JSON.parse(Buffer.from(payload, 'base64url').toString());
        return typeof value.id === 'string' && /^[a-zA-Z0-9_-]{1,200}$/.test(value.id) && typeof value.selectedBy === 'string' && value.purpose === purpose && Number.isFinite(value.expires) && value.expires > now ? value : null;
    } catch { return null; }
}
