import { parseBookFrontmatter } from '../book-frontmatter.ts';

/** Shared by every text provider and every creation/edit request in the Card workspace. */
export function miniAppInstruction(mode: unknown, markdown: unknown, planMode: unknown): string {
    if (planMode || mode !== 'card' || typeof markdown !== 'string' ||
        parseBookFrontmatter(markdown).playMode !== 'miniapp') return '';

    return `

MINI APP EMBEDDING REQUIREMENTS (for this play_mode: miniapp Card):
- This Card is an interactive Mini App embedded in PapeRobo, not a long-form article. These layout requirements override the generic Card instructions to write long, dense text. Keep the existing Markdown/frontmatter format and edit_card workflow.
- Preserve play_mode: miniapp, the Card identity and its existing publication settings. Do not publish or change visibility merely to make embedding work.
- Use 330 x 480 CSS pixels as a design reference, with a portrait viewport ratio of 11:16. These are reference dimensions, NOT fixed CSS width/height. Fit the available container width (100%, border-box) and remain usable at 240 x 349 CSS pixels and larger widths without horizontal scrolling.
- The PapeRobo bubble occupies 82% of its message area with 6px padding. Its title/close row sits OUTSIDE the 11:16 iframe. Do not subtract that row from the iframe viewport or calculate app width as 82% again.
- The HyperCard viewer can add its own padding and controls. Fit the actual Card content container, not an assumed full browser width; avoid 100vw inside padded containers. Scope custom styles to the app root rather than changing shared viewer styles.
- Keep the main task and primary controls visible in the initial viewport where practical. Allow vertical scrolling for longer content; do not clip necessary controls with fixed heights or overflow:hidden. Use compact 8-12px app spacing where appropriate without unnecessarily doubling viewer padding.
- Prefer touch controls about 40-44px high, readable text, flexible columns and wrapping labels. Avoid duplicate app title/close chrome because PapeRobo already supplies it, unless the user explicitly requests it or the app function needs it.
- The outer iframe sandbox allows scripts, forms and popups, but not allow-same-origin or top navigation. Do not depend on parent/top DOM, parent cookies, authenticated parent sessions or unrestricted storage. Guard localStorage/IndexedDB access and provide a usable in-memory fallback. External APIs must support this embedding environment; do not invent available backend APIs or authentication.
- PapeRobo AI is available as \`await paperobo.ask(prompt)\` (already loaded for MiniApps; no API key or sign-in needed). It sends plain text or Markdown (up to 8000 characters) to PapeRobo's AI, which also sees the conversation of the chat that opened the MiniApp, and resolves to a Markdown string. It can be called multiple times, but only on the PapeRobo Pro plan or above (Standard and Free cannot call it). Show a loading state while waiting and render the returned Markdown safely (escape HTML). \`await paperobo.say(text)\` posts a message (up to 8000 characters) to the PapeRobo group chat as the MiniApp itself: other participants see it and it is saved in the chat history, but it does NOT trigger an AI reply, and the AI can read it as history the next time it is called. It is also Pro plan or above only. Both reject with an Error whose \`code\` is NOT_IN_PAPEROBO (opened outside PapeRobo), INVALID_PROMPT or INVALID_TEXT, TIMEOUT, a plan-restriction code returned by PapeRobo, or another failure; always catch it and show a usable message (for example, explain that the feature needs the Pro plan). No other PapeRobo or HyperCardBook APIs exist.
- Keep the existing Card runtime and supported execution mechanisms. Do not assume an arbitrary inline script will execute merely because it is present in Markdown. Reuse supported interactive structures and state any required runtime support instead of claiming it exists.
- Apply these constraints to the requested new UI and subsequent edits. Preserve unrelated content/behavior; a small edit is not permission to rewrite the entire app.
- When preview/verification tools are available, check 330 x 480 and 240 x 349 viewports for overflow, clipped text and reachable controls. Never claim visual verification unless it was actually performed.
`;
}
