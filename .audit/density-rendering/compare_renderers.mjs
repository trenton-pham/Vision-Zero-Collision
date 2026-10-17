import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.resolve(root, '../..', 'frontend/package.json'));
const { chromium, devices } = require('@playwright/test');
const payloads = JSON.parse(await fs.readFile(path.join(root, 'payloads.json'), 'utf8'));
const variants = ['svg', 'canvas'];
const servers = [];
const types = { '.js': 'text/javascript', '.css': 'text/css', '.woff': 'font/woff', '.woff2': 'font/woff2', '.html': 'text/html' };
const failures = [];

for (const [index, variant] of variants.entries()) {
  const directory = path.join(root, variant);
  const files = await fs.readdir(path.join(directory, 'assets'));
  const maps = files.find((name) => name.startsWith('maps-') && name.endsWith('.js'));
  assert(maps, `Missing ${variant} maps bundle`);
  const html = await fs.readFile(path.join(directory, 'index.html'), 'utf8');
  const match = html.match(/<script type="module"[^>]*src="([^"]+)"[^>]*><\/script>/);
  assert(match, 'Production application entry must exist');
  const boot = `<script type="module">
    const {l:L} = await import('/assets/${maps}');
    const params = new URLSearchParams(location.search);
    const layer = params.get('layer') || 'heatmap';
    const response = await fetch('/benchmark-expected?layer=' + layer).then(r => r.json());
    window.__expected = response;
    L.Map.addInitHook(function() {
      window.__map = this;
      window.__overlayStart = performance.now();
    });
    const onAdd = L.CircleMarker.prototype.onAdd;
    let added = 0;
    L.CircleMarker.prototype.onAdd = function(map) {
      const result = onAdd.call(this, map);
      added += 1;
      if (added === response.circles) requestAnimationFrame(() => requestAnimationFrame(() => {
        window.__overlayMs = performance.now() - window.__overlayStart;
        window.__overlayCount = added;
      }));
      return result;
    };
    await import('${match[1]}');
  </script>`;
  const servedHtml = html.replace(match[0], boot);
  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://localhost');
      if (url.pathname === '/benchmark-expected') {
        const selected = url.searchParams.get('layer');
        const density = payloads[`/api/citywide/${selected}?start_year=2015&end_year=2026`];
        const shift = payloads['/api/citywide/spatial-shift?start_year=2015&end_year=2026'];
        const circles = (selected === 'heatmap' ? density.points.length : density.cells.filter(c => c.density > .06).length) + (shift.status === 'available' ? 2 : 0);
        response.setHeader('Content-Type', 'application/json');
        response.end(JSON.stringify({ circles }));
      } else if (url.pathname.startsWith('/api/')) {
        const canonical = url.pathname + url.search;
        assert(Object.hasOwn(payloads, canonical), `Unrecorded API request ${canonical}`);
        response.setHeader('Content-Type', 'application/json');
        response.end(JSON.stringify(payloads[canonical]));
      } else if (url.pathname.startsWith('/assets/')) {
        const file = path.resolve(directory, '.' + url.pathname);
        assert(file.startsWith(directory + path.sep));
        response.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
        response.end(await fs.readFile(file));
      } else if (url.pathname === '/favicon.ico') {
        response.writeHead(204).end();
      } else {
        response.setHeader('Content-Type', 'text/html');
        response.end(servedHtml);
      }
    } catch (error) {
      failures.push(String(error));
      response.writeHead(500).end(String(error));
    }
  });
  await new Promise((resolve) => server.listen(4190 + index, '127.0.0.1', resolve));
  servers.push(server);
}

const browser = await chromium.launch({ headless: true });
const samples = [];
const profile = process.argv.includes('--profile');
const quick = process.argv.includes('--smoke') || profile;
const median = values => [...values].sort((a,b)=>a-b)[Math.floor(values.length / 2)];
try {
  for (const viewport of ['desktop', 'mobile']) {
    const options = viewport === 'desktop' ? { viewport: {width:1440, height:1000}, deviceScaleFactor:1 } : { ...devices['iPhone 13'], defaultBrowserType: undefined, viewport:{width:390,height:844} };
    for (const layer of ['heatmap', 'kde']) {
      const contexts = {};
      for (const variant of variants) {
        const context = await browser.newContext(options);
        await context.route('https://tile.openstreetmap.org/**', route => route.fulfill({status:200, contentType:'image/png', body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64')}));
        contexts[variant] = context;
      }
      for (let pair = -1; pair < (quick ? 1 : 5); pair++) {
        for (const variant of variants) {
          const page = await contexts[variant].newPage();
          const profiler = profile && pair === 0 ? await contexts[variant].newCDPSession(page) : null;
          if (profiler) { await profiler.send('Profiler.enable'); await profiler.send('Profiler.start'); }
          const pageErrors = [];
          page.on('pageerror', error => pageErrors.push(String(error)));
          page.on('response', response => { if(response.status() >=400) pageErrors.push(`${response.status()} ${response.url()}`); });
          await page.goto(`http://127.0.0.1:${4190 + variants.indexOf(variant)}/citywide?start=2015&end=2026&layer=${layer}`);
          await page.waitForFunction(() => Number.isFinite(window.__overlayMs));
          const renderer = variant === 'canvas' ? 'canvas' : 'svg';
          assert.equal(await page.locator(`.leaflet-overlay-pane > ${renderer}`).count(), 1);
          const result = await page.evaluate(async () => {
            const map = window.__map;
            const intervals = [];
            let previous = performance.now();
            let active = true;
            function frame(now) { if (!active) return; intervals.push(now - previous); previous = now; requestAnimationFrame(frame); }
            requestAnimationFrame(frame);
            async function move(action) { await new Promise(resolve => { map.once('moveend', resolve); action(); }); await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); }
            for (const offset of [[100,50],[-100,-50],[80,-40],[-80,40]]) await move(() => map.panBy(offset,{animate:true,duration:.25}));
            await move(() => map.setZoom(12,{animate:true}));
            await move(() => map.setZoom(11,{animate:true}));
            active = false;
            intervals.sort((a,b)=>a-b);
            return { overlayMs:window.__overlayMs, circles:window.__overlayCount, expectedCircles:window.__expected.circles, frameP95Ms:intervals[Math.floor(intervals.length*.95)], frames:intervals.length, renderedLayers:Object.values(map._layers).filter(layer=>layer._renderer).length };
          });
          assert.equal(result.circles, result.expectedCircles, 'All real collision overlays must be added');
          assert(result.frames >= 20, 'Pan/zoom measurement must contain animation frames');
          assert(result.renderedLayers > result.circles, 'Downtown rectangle and shift line must exist');
          assert.deepEqual(pageErrors, [], 'Renderer must not produce browser or HTTP errors');
          if (profiler) {
            const captured = await profiler.send('Profiler.stop');
            await fs.writeFile(path.join(root,`${variant}-${viewport}-${layer}.cpuprofile`),JSON.stringify(captured.profile));
            await profiler.detach();
          }
          if (pair === 0) await page.screenshot({path:path.join(root, `${variant}-${viewport}-${layer}.png`),fullPage:true,animations:'disabled'});
          if (pair >= 0) {
            samples.push({variant,viewport,layer,pair,...result});
            console.log(JSON.stringify(samples.at(-1)));
          }
          await page.close();
        }
      }
      for (const context of Object.values(contexts)) await context.close();
    }
  }
  assert.deepEqual(failures, []);
  const summaries = [];
  for (const viewport of ['desktop','mobile']) for (const layer of ['heatmap','kde']) for (const metric of ['overlayMs','frameP95Ms']) {
    const svg = samples.filter(s=>s.variant==='svg' && s.viewport===viewport && s.layer===layer).map(s=>s[metric]);
    const canvas = samples.filter(s=>s.variant==='canvas' && s.viewport===viewport && s.layer===layer).map(s=>s[metric]);
    const baseline = median(svg), candidate=median(canvas), variation=Math.max(...svg)-Math.min(...svg);
    summaries.push({viewport,layer,metric,svgMedian:baseline,svgRange:[Math.min(...svg),Math.max(...svg)],canvasMedian:candidate,canvasRange:[Math.min(...canvas),Math.max(...canvas)],improvementPercent:100*(baseline-candidate)/baseline,svgVariation:variation,qualifies:baseline-candidate>=.1*baseline && baseline-candidate>variation,regresses:candidate>baseline*1.1});
  }
  const outcome = {browser:browser.version(),base:'c06e61df7a9d055eba83aef2a7200f6996c60d6b',mobile:'Chromium emulation, iPhone 13 device settings',tilePolicy:'Identical local transparent PNG tiles; no external tile timing',samples,summaries,acceptCanvas:!quick && summaries.some(s=>s.qualifies) && !summaries.some(s=>s.regresses)};
  await fs.writeFile(path.join(root,quick?'renderer-smoke.json':'renderer-results.json'),JSON.stringify(outcome,null,2));
  console.log(JSON.stringify({summaries,acceptCanvas:outcome.acceptCanvas},null,2));
} finally {
  await browser.close();
  for (const server of servers) await new Promise(resolve=>server.close(resolve));
}
