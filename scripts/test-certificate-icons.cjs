/* Offline browser regression: no CMS/network writes and no installed dependencies.
 * PLAYWRIGHT_MODULE: path to an existing Playwright package.
 * ICONIFY_SCRIPT: local copy of the pinned iconify-icon 3.0.0 browser script.
 * node scripts/test-certificate-icons.cjs
 * Optional CERTIFICATE_SOURCE overrides only the renderer for before/after checks.
 * --mcp-file <outside-webroot.js> emits the same test for Playwright MCP.
 */
async function runCertificateIcons(browser, files) {
    const results = [], errors = [], contexts = [];
    const check = (name, pass, detail) => results.push({ name, pass, detail });
    const data = Array.from({ length: 5 }, (_, i) => ({
        id: 'isolated-' + i, title: 'DEMO certificate ' + i, year: '2026',
        publisher: 'Isolated fixture', icon: 'tabler:fixture-' + i,
        badge: 'Certified', credentialId: 'DEMO-' + i, link: '/document.html'
    }));
    // Existing certificate glyph; varying identifiers exercise cache/load paths.
    const body = '<g fill="none" stroke="currentColor" stroke-width="2"><path d="M3 5h18v14H3zM6 9h12M6 12h5M6 15h4"/></g>';
    async function create(viewport, mode = 'normal') {
        const context = await browser.newContext({ viewport, hasTouch: true, isMobile: viewport.width < 700, serviceWorkers: 'block' });
        contexts.push(context);
        let requests = 0;
        await context.addInitScript(() => {
            const NativeObserver = window.IntersectionObserver;
            window.__iconObservers = [];
            // Fault injection: delayed/out-of-order offscreen notification.
            // Other observers, including carousel reveal, stay native.
            window.IntersectionObserver = class extends NativeObserver {
                constructor(callback, options) { super(callback, options); this.callback = callback; }
                observe(target) {
                    if (target.matches('.cert-icon')) window.__iconObservers.push({ target, callback: this.callback });
                    return super.observe(target);
                }
            };
            window.__lateIconExit = () => window.__iconObservers.forEach(({ target, callback }) => callback([{ target, isIntersecting: false }]));
        });
        await context.route('**/*', async route => {
            const request = route.request(), url = new URL(request.url());
            if (request.method() !== 'GET') { errors.push('Unexpected mutation'); return route.abort(); }
            if (url.hostname === '127.0.0.1') {
                const resources = {
                    '/': ['text/html', files.html], '/css/style.css': ['text/css', files.style],
                    '/css/certificate-card.css': ['text/css', files.cardCSS],
                    '/js/certificates.js': ['text/javascript', files.source],
                    '/iconify.js': ['text/javascript', mode === 'no-library' ? '' : files.iconify],
                    '/document.html': ['text/html', '<title>Isolated certificate</title>']
                };
                const resource = resources[url.pathname];
                return route.fulfill({ status: resource ? 200 : 404, contentType: resource?.[0] || 'text/plain', body: resource?.[1] || '' });
            }
            if (['api.iconify.design', 'api.simplesvg.com', 'api.unisvg.com'].includes(url.hostname)) {
                requests++;
                if (mode === 'slow') await new Promise(resolve => setTimeout(resolve, 1800));
                const names = (url.searchParams.get('icons') || '').split(',');
                return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ prefix: 'tabler', width: 24, height: 24,
                    icons: mode === 'failure' ? {} : Object.fromEntries(names.map(name => [name, { body }])),
                    not_found: mode === 'failure' ? names : [] }) });
            }
            errors.push('Blocked unexpected host: ' + url.hostname);
            return route.abort();
        });
        const page = await context.newPage();
        page.on('pageerror', e => errors.push(e.message));
        page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
        await page.goto('http://127.0.0.1:5547/');
        await page.evaluate(data => {
            // Cancel the existing one-time intro hint, without changing renderer.
            document.querySelector('#certificates').dispatchEvent(new Event('pointerdown', { bubbles: true }));
            window.certificatesCarousel.rebuild(data);
        }, data);
        return { page, context, requests: () => requests };
    }
    async function visibleGlyph(page, label) {
        const icon = page.locator('.cert-slot.is-active .cert-icon');
        // In landscape the navigation can scroll the glyph out of view.
        // Measure after returning it to view, not before screenshot auto-scroll.
        await icon.scrollIntoViewIfNeeded();
        await page.waitForTimeout(80);
        const state = await icon.evaluate(el => {
            const root = el.shadowRoot || el, svg = root.querySelector('svg');
            const style = getComputedStyle(el), box = el.getBoundingClientRect();
            return { svg: !!svg?.querySelector('path,g'), width: box.width, height: box.height,
                display: style.display, visibility: style.visibility, opacity: style.opacity,
                inFront: !!el.closest('.cert-face-front'), observed: !!el._observer };
        });
        // Read pixels of the real composited screenshot, not SVG markup alone.
        const png = (await icon.screenshot({ animations: 'allow' })).toString('base64');
        const bluePixels = await page.evaluate(async png => {
            const bytes = Uint8Array.from(atob(png), c => c.charCodeAt(0));
            const image = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
            const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
            const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0); image.close();
            const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
            let blue = 0;
            for (let i = 0; i < pixels.length; i += 4) if (pixels[i + 2] > pixels[i] + 50 && pixels[i + 1] > pixels[i] + 15 && pixels[i + 3] > 100) blue++;
            return blue;
        }, png);
        check(label, state.svg && state.width > 0 && state.height > 0 && state.visibility === 'visible' && state.inFront && bluePixels > 15, { ...state, bluePixels });
    }
    async function navigate(page, direction = 'next', delay = 720) {
        await page.locator('.cert-nav-' + direction).click();
        await page.waitForTimeout(delay);
    }
    try {
        for (const viewport of [{ width: 390, height: 844 }, { width: 430, height: 932 }, { width: 360, height: 800 }, { width: 768, height: 1024 }, { width: 1440, height: 900 }, { width: 844, height: 390 }]) {
            const { page, context, requests } = await create(viewport);
            await page.waitForTimeout(800);
            const prefix = viewport.width + 'x' + viewport.height;
            await visibleGlyph(page, prefix + ' initial');
            const nodes = await page.evaluateHandle(() => [...document.querySelectorAll('.cert-icon')]);
            const loadedRequests = requests();
            // Five complete cycles, alternating forward/back. Every card sampled.
            for (let cycle = 0; cycle < 5; cycle++) for (let i = 0; i < data.length; i++) {
                await navigate(page, cycle % 2 ? 'prev' : 'next');
                await visibleGlyph(page, prefix + ' cycle ' + cycle + ' card ' + i);
            }
            await page.locator('.cert-slot.is-active').press('Enter');
            await page.waitForTimeout(650);
            const link = page.locator('.cert-slot.is-active .cert-link');
            check(prefix + ' flip back', await link.isVisible() && await link.getAttribute('target') === '_blank');
            const popupPromise = context.waitForEvent('page');
            await link.click(); const popup = await popupPromise; await popup.waitForLoadState();
            check(prefix + ' certificate new tab', popup.url().endsWith('/document.html') && await popup.evaluate(() => opener === null));
            await popup.close();
            await page.locator('.cert-slot.is-active').press('Enter'); await page.waitForTimeout(650);
            await visibleGlyph(page, prefix + ' flip return');
            await page.locator('.cert-slot.is-active').press('Enter'); await page.waitForTimeout(650);
            await navigate(page); await navigate(page, 'prev');
            await visibleGlyph(page, prefix + ' navigate while flipped and return');
            await page.evaluate(() => window.__lateIconExit());
            await visibleGlyph(page, prefix + ' stale offscreen callback');
            check(prefix + ' stable nodes and request cache', await page.evaluate(old => old.every((el, i) => el === document.querySelectorAll('.cert-icon')[i]), nodes) && requests() === loadedRequests);
            await page.setViewportSize({ width: viewport.height, height: viewport.width }); await page.waitForTimeout(800);
            await visibleGlyph(page, prefix + ' resized');
            await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await page.waitForTimeout(150);
            await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(300);
            await visibleGlyph(page, prefix + ' scroll away and return');
            const other = await context.newPage(); await other.bringToFront(); await page.bringToFront(); await other.close();
            await visibleGlyph(page, prefix + ' tab return');
            await context.close();
        }
        for (const mode of ['slow', 'failure', 'no-library']) {
            const { page, context } = await create({ width: 390, height: 844 }, mode);
            await page.waitForTimeout(100);
            await visibleGlyph(page, mode + ' loading/fallback');
            // Real touch events, quick and slow in both directions.
            const cdp = await context.newCDPSession(page);
            for (const [direction, delay] of [[1, 16], [-1, 16], [1, 90], [-1, 90]]) {
                const box = await page.locator('.cert-slot.is-active .cert-front-text').boundingBox();
                const start = box.x + box.width / 2 + direction * 45, y = box.y + 20;
                const before = await page.locator('.cert-slot.is-active').getAttribute('aria-label');
                await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: start, y }] });
                for (let i = 1; i <= 8; i++) {
                    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: start - direction * i * 16, y }] });
                    await page.waitForTimeout(delay);
                }
                await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
                await page.waitForTimeout(800);
                check(mode + ' touch ' + direction + '/' + delay, before !== await page.locator('.cert-slot.is-active').getAttribute('aria-label'));
                await visibleGlyph(page, mode + ' swipe glyph ' + direction + '/' + delay);
            }
            await page.waitForTimeout(2000);
            await visibleGlyph(page, mode + ' response settled');
            check(mode + ' resolved artwork', await page.evaluate(({ mode, body }) => {
                const el = document.querySelector('.cert-slot.is-active .cert-icon');
                return mode === 'no-library' ? !!el.querySelector('svg path') :
                    mode === 'failure' ? !!el.icon?.body && el.icon.body !== body : el.icon?.body === body;
            }, { mode, body }));
            // Rebuild uses the same renderer/API as CMS order changes.
            await page.evaluate(data => window.certificatesCarousel.rebuild([...data].reverse()), data);
            await page.waitForTimeout(800); await visibleGlyph(page, mode + ' reordered');
            await context.close();
        }
        check('No browser errors or unexpected network', errors.length === 0, errors);
        return { passed: results.filter(x => x.pass).length, failed: results.filter(x => !x.pass).length, results, errors };
    } finally {
        for (const context of contexts) await context.close().catch(() => {});
    }
}

if (require.main === module) {
    (async () => {
        const fs = require('node:fs'), path = require('node:path');
        const root = path.resolve(__dirname, '..');
        if (!process.env.ICONIFY_SCRIPT) throw new Error('Set ICONIFY_SCRIPT to the existing pinned iconify-icon 3.0.0 script (no automatic download).');
        const read = file => fs.readFileSync(path.join(root, file), 'utf8');
        const section = read('index.html').match(/<section\b[^>]*id="certificates"[\s\S]*?<\/section>/)?.[0];
        if (!section) throw new Error('Actual Certificate section not found');
        const files = {
            source: process.env.CERTIFICATE_SOURCE ? fs.readFileSync(process.env.CERTIFICATE_SOURCE, 'utf8') : read('js/certificates.js'),
            style: read('css/style.css'), cardCSS: read('css/certificate-card.css'),
            iconify: fs.readFileSync(process.env.ICONIFY_SCRIPT, 'utf8'),
            html: '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"><link rel="stylesheet" href="/css/style.css"><link rel="stylesheet" href="/css/certificate-card.css"><script src="/iconify.js"></script><script defer src="/js/certificates.js"></script></head><body><div style="height:40px"></div>' + section.replace(/\breveal\b/g, 'reveal reveal-active') + '<div style="height:1000px"></div></body></html>'
        };
        const output = process.argv.indexOf('--mcp-file');
        if (output >= 0) {
            fs.writeFileSync(process.argv[output + 1], 'async(page)=>(' + runCertificateIcons.toString() + ')(page.context().browser(),' + JSON.stringify(files) + ')');
            return;
        }
        const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
        const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' });
        try {
            const result = await runCertificateIcons(browser, files);
            console.log(JSON.stringify(result, null, 2));
            process.exitCode = result.failed ? 1 : 0;
        } finally { await browser.close(); }
    })().catch(error => { console.error(error.message); process.exitCode = 1; });
}
module.exports = runCertificateIcons;
