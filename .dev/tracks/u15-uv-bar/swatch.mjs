import { chromium } from '@playwright/test'
import { readFileSync } from 'node:fs'
const css = readFileSync('dist/assets/index-C7Wul5Uy.css', 'utf8')
const levels = [[0,'low','laag'],[3,'moderate','matig'],[6,'high','hoog'],[8,'very-high','zeer hoog'],[11,'extreme','extreem']]
const lvl = (v) => levels.filter(([f]) => v >= f).at(-1)
const pct = (v) => Math.min(v, 12) / 12 * 100 + '%'
const fmt = (v) => v.toLocaleString('nl-NL', { maximumFractionDigits: 1 })
function bar(v, c, variant, est) {
  if (v == null) return '<span class="uv-bar uv-bar-dark"><span class="uv-bar-track"></span></span>'
  const inner = (variant === 'double' ? `<span class="uv-bar-clear" style="width:${pct(c)}"></span>` : '') +
    `<span class="uv-bar-fill" style="width:${pct(v)}"></span>` +
    (variant === 'dot' && c - v >= 0.3 ? `<span class="uv-bar-dot" style="left:${pct(c)}"></span>` : '')
  return `<span class="uv-bar ${est ? 'estimated' : ''}" data-variant="${variant}" data-level="${lvl(v)[1]}" data-clear-level="${lvl(c)[1]}"><span class="uv-bar-track">${inner}</span><span class="uv-bar-value">${est ? '≈' : ''}${fmt(v)}</span><span class="uv-bar-level">${v >= 3 ? lvl(v)[2] : ''}</span></span>`
}
const cases = [['09:00','zon, laag',1.4,1.5,false],['11:00','gebroken bewolking',3.9,6.1,false],['13:00','zomer, zon',6.6,7.2,false],['14:00','dik bewolkt',1.8,6.8,true],['15:00','juni-piek',8.4,8.6,true],['16:00','extreem (zuiden)',11.2,11.6,true],['23:00','nacht',null,null,false]]
const browser = await chromium.launch()
for (const theme of ['light','dark']) {
  const page = await browser.newPage({ viewport: { width: 560, height: 600 }, deviceScaleFactor: 2 })
  const rows = cases.map(([t, d, v, c, e]) => `<tr><td style="padding:10px 8px;font-weight:700">${t}</td><td style="color:var(--muted);font-size:11px;width:120px">${d}</td><td class="uv-cell">${bar(v, c, 'double', e)}</td><td class="uv-cell">${bar(v, c, 'dot', e)}</td></tr>`).join('')
  const chip = (variant) => `<span class="uv-chip sidebar-uv-chip" data-level="moderate"><span class="uv-long">Insmeren · UV 3,9 matig</span><span class="uv-bar uv-bar-bare" data-level="moderate" data-clear-level="high"><span class="uv-bar-track">${variant==='double'?'<span class="uv-bar-clear" style="width:'+pct(6.1)+'"></span>':''}<span class="uv-bar-fill" style="width:${pct(3.9)}"></span>${variant==='dot'?'<span class="uv-bar-dot" style="left:'+pct(6.1)+'"></span>':''}</span></span></span>`
  await page.setContent(`<html data-theme="${theme}"><head><style>${css}</style></head><body style="padding:16px;font-family:Inter,system-ui"><table style="border-collapse:collapse"><thead><tr><th></th><th></th><th style="text-align:left;font-size:11px">A · dubbele vulling</th><th style="text-align:left;font-size:11px">B · stip</th></tr></thead><tbody>${rows}</tbody></table><p style="display:flex;gap:12px;margin-top:14px">${chip('double')}${chip('dot')}</p></body></html>`)
  await page.screenshot({ path: `/tmp/claude-1000/shot/png/staalkaart-${theme}.png`, fullPage: true })
  await page.close()
}
await browser.close()
