/**
 * Draws an Open Graph card (see $lib/og.js) to a 1200×630 PNG. Runs only at
 * build time, from the prerendered /og/… endpoints: satori lays the card out
 * as SVG, resvg rasterises it. Neither ships to the browser.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { OG_HEIGHT, OG_WIDTH, headlineSize } from '../../og.js';

// Paths are relative to the repo root, where `vite build` (and its prerender) runs
const FONT_DIR = 'src/lib/server/og/fonts';

// Design tokens from src/app.css
const C = {
  bg: '#0b0b0f',
  surface: '#151519',
  border: '#252530',
  text: '#e4e4eb',
  muted: '#7a7a8a',
  accent: '#6b8aff',
  fits: '#4ade80',
  tight: '#facc15',
  'no-fit': '#f87171',
};

let assets;
function loadAssets() {
  assets ??= {
    fonts: [
      { name: 'Inter', weight: 400, style: 'normal', data: readFileSync(resolve(FONT_DIR, 'inter-latin-400-normal.woff')) },
      { name: 'Inter', weight: 800, style: 'normal', data: readFileSync(resolve(FONT_DIR, 'inter-latin-800-normal.woff')) },
    ],
    logo: `data:image/png;base64,${readFileSync(resolve('static/logo.png')).toString('base64')}`,
  };
  return assets;
}

/** Minimal element factory in the shape satori takes (what JSX compiles to). */
function h(type, style, ...children) {
  const kids = children.flat().filter((c) => c != null && c !== false);
  return { type, props: { style, children: kids.length === 1 ? kids[0] : kids } };
}

const oneLine = { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' };

function stat({ value, label, tone }) {
  return h(
    'div',
    {
      display: 'flex',
      flexDirection: 'column',
      padding: '18px 28px',
      background: C.surface,
      border: `2px solid ${C.border}`,
      borderLeft: `6px solid ${C[tone] ?? C.accent}`,
      borderRadius: 12,
      flexShrink: 1,
      minWidth: 0,
    },
    h('div', { fontSize: 56, fontWeight: 800, color: C[tone] ?? C.accent, lineHeight: 1 }, value),
    h('div', { fontSize: 26, color: C.text, marginTop: 10, ...oneLine }, label)
  );
}

/**
 * @param {import('$lib/og.js').OgCard} card
 * @param {string} logo  Logo image as a data: URL
 * @returns {object} satori element tree
 */
export function cardTree(card, logo) {
  const titleSize = headlineSize(card.title);
  return h(
    'div',
    {
      width: '100%',
      height: '100%',
      boxSizing: 'border-box',
      display: 'flex',
      flexDirection: 'column',
      padding: '44px 64px 48px',
      background: C.bg,
      borderTop: `8px solid ${C.accent}`,
      color: C.text,
      fontFamily: 'Inter',
    },
    // Brand row
    h(
      'div',
      { display: 'flex', alignItems: 'center' },
      { type: 'img', props: { src: logo, width: 64, height: 64, style: { borderRadius: 14 } } },
      h('div', { fontSize: 30, fontWeight: 800, marginLeft: 18 }, 'What Models?'),
      h('div', { fontSize: 26, color: C.muted, marginLeft: 'auto' }, 'whatmodelscanirun.com')
    ),
    // Headline block
    h(
      'div',
      { display: 'flex', flexDirection: 'column', marginTop: 32 },
      h('div', { fontSize: 28, fontWeight: 800, color: C.accent, textTransform: 'uppercase', letterSpacing: 2, ...oneLine }, card.eyebrow),
      h(
        'div',
        { fontSize: titleSize, fontWeight: 800, lineHeight: 1.08, marginTop: 10, letterSpacing: -1, display: 'block', lineClamp: 2 },
        card.title
      ),
      card.subtitle && h('div', { fontSize: 32, color: C.muted, marginTop: 14, ...oneLine }, card.subtitle)
    ),
    // Stats and picks, pinned to the bottom
    h(
      'div',
      { display: 'flex', flexDirection: 'column', marginTop: 'auto', paddingTop: 20 },
      h('div', { display: 'flex', gap: 20, width: '100%' }, card.stats.map(stat)),
      card.picksLabel &&
        card.picks.length > 0 &&
        h(
          'div',
          { display: 'flex', fontSize: 26, marginTop: 22, maxWidth: OG_WIDTH - 128 },
          h('span', { color: C.muted, marginRight: 12, flexShrink: 0 }, `${card.picksLabel}:`),
          h('span', { color: C.text, fontWeight: 800, ...oneLine }, card.picks.join(' · '))
        )
    )
  );
}

/**
 * Render a card to PNG bytes.
 * @param {import('$lib/og.js').OgCard} card
 * @returns {Promise<Uint8Array>}
 */
export async function renderCard(card) {
  const { fonts, logo } = loadAssets();
  const svg = await satori(cardTree(card, logo), { width: OG_WIDTH, height: OG_HEIGHT, fonts });
  return new Resvg(svg, { fitTo: { mode: 'width', value: OG_WIDTH } }).render().asPng();
}

/**
 * Response for a prerendered image endpoint.
 * @param {import('$lib/og.js').OgCard} card
 * @returns {Promise<Response>}
 */
export async function pngResponse(card) {
  return new Response(await renderCard(card), { headers: { 'Content-Type': 'image/png' } });
}
