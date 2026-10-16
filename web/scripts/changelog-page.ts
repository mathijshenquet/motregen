import type { Brand } from '../src/core/brand'
import { readReleases, readVersion, type ChangeNote } from '../../tools/changelog'

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!)
}

function renderNote(note: ChangeNote): string {
  return `<article><span class="kind">${note.kind}</span><h3>${escapeHtml(note.title)}</h3>${note.body.split(/\n\s*\n/).map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join('')}${note.media.map((media) => {
    const source = `/${media.file}`
    return `<figure>${media.file.endsWith('.mp4') ? `<video src="${source}" muted playsinline controls preload="metadata" aria-label="${escapeHtml(media.caption)}"></video>` : `<img src="${source}" alt="${escapeHtml(media.caption)}" loading="lazy" decoding="async">`}<figcaption>${escapeHtml(media.caption)}</figcaption></figure>`
  }).join('')}</article>`
}

export function renderChangelogPage(root: string, brand: Brand): string {
  const version = readVersion(root)
  const releases = readReleases(root, false)
  const content = releases.length ? releases.map((release) => `<section id="v${release.version}" aria-labelledby="title-${release.version}"><header class="release-heading"><h2 id="title-${release.version}">v${release.version}</h2><time datetime="${release.date}">${new Intl.DateTimeFormat('nl-NL', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(`${release.date}T12:00:00Z`))}</time></header>${release.notes.map(renderNote).join('')}</section>`).join('') : '<section class="empty"><h2>De eerste update komt eraan</h2><p>Hier lees je straks wat er nieuw, verbeterd of opgelost is.</p></section>'
  return `<!doctype html>
<html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light dark"><title>Changelog — ${escapeHtml(brand.name)}</title><meta name="description" content="Lees wat er nieuw, verbeterd en opgelost is in ${escapeHtml(brand.name)}."><link rel="canonical" href="${escapeHtml(brand.canonicalOrigin)}/changelog"><link rel="icon" href="/droplet.svg">
<script>try{const stored=localStorage.getItem('motregen-theme');document.documentElement.dataset.theme=stored==='dark'||(stored==='system'&&matchMedia('(prefers-color-scheme: dark)').matches)?'dark':'light'}catch{}</script>
<style>
:root{font-family:Inter,ui-sans-serif,system-ui,sans-serif;color-scheme:light;--page:#eaf1f3;--surface:#fff;--text:#102630;--muted:#526c78;--line:#cad6db;--accent:#087a9d}
:root[data-theme=dark]{color-scheme:dark;--page:#07131a;--surface:#0d1d25;--text:#edf8fc;--muted:#a2bac5;--line:#29404c;--accent:#62d4f4}
@media(prefers-color-scheme:dark){:root:not([data-theme=light]){color-scheme:dark;--page:#07131a;--surface:#0d1d25;--text:#edf8fc;--muted:#a2bac5;--line:#29404c;--accent:#62d4f4}}
*{box-sizing:border-box}body{margin:0;background:var(--page);color:var(--text);line-height:1.6}main{width:min(100% - 40px,760px);margin:0 auto;padding:28px 0 64px}a{color:var(--accent);text-underline-offset:4px}a:focus-visible{outline:2px solid var(--accent);outline-offset:5px}.back{display:inline-flex;align-items:center;gap:10px}.back img{width:24px;height:28px}.intro{margin:46px 0 36px}.eyebrow,.kind{font-size:.8rem;font-weight:650;letter-spacing:.04em}.eyebrow{color:var(--muted)}h1{font-size:clamp(2.2rem,6vw,3.5rem);line-height:1.1;margin:12px 0 20px;letter-spacing:-.04em}.intro p{max-width:42em;color:var(--muted)}section{scroll-margin-top:24px;margin:0 0 32px;padding:28px;background:var(--surface);border:1px solid var(--line);border-radius:20px}.release-heading{display:flex;align-items:baseline;justify-content:space-between;gap:16px;flex-wrap:wrap;border-bottom:1px solid var(--line);padding-bottom:18px}h2{font-size:1.45rem;margin:0}time,figcaption,footer{color:var(--muted);font-size:.9rem}article{padding-top:26px}article+article{margin-top:26px;border-top:1px solid var(--line)}.kind{color:var(--accent);text-transform:capitalize}h3{font-size:1.15rem;line-height:1.35;margin:6px 0 10px}p{margin:0 0 16px;overflow-wrap:anywhere}figure{margin:22px 0 4px}figure img,video{display:block;width:100%;height:auto;border-radius:10px;background:var(--page)}figcaption{margin-top:10px}.empty p{margin:12px 0 0}footer{padding:4px 0}@media(max-width:480px){main{width:calc(100% - 28px);padding-top:22px}.intro{margin-top:36px}section{padding:22px 18px;border-radius:16px}}
</style></head><body><main><a class="back" href="/"><img src="/droplet.svg" alt="">Terug naar ${escapeHtml(brand.name)}</a><header class="intro"><span class="eyebrow">MOTREGEN UPDATES</span><h1>Wat is er nieuw?</h1><p>Alle verbeteringen aan je weerbericht, van kleine oplossingen tot nieuwe mogelijkheden.</p></header>${content}<footer>Huidige versie: ${version}</footer></main></body></html>`
}
