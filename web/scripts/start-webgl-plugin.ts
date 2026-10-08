import type { Plugin } from 'vite'

export function startWebgl(mode: string | undefined): Plugin {
  return {
    name: 'motregen-start-webgl',
    transformIndexHtml(html) {
      if (mode !== 'worker') return html
      return {
        html,
        tags: [{
          tag: 'script',
          injectTo: 'head',
          children: `{
            const warmParams = new URLSearchParams(location.search);
            if (!warmParams.has('skywatch-render') && warmParams.get('still') !== '1'
                && innerWidth >= 900 && navigator.hardwareConcurrency >= 8
                && typeof Worker === 'function' && typeof OffscreenCanvas === 'function') {
              const source = new Blob([
                'try { const canvas = new OffscreenCanvas(1, 1); const context = canvas.getContext("webgl2", { alpha: true, depth: true, stencil: true, antialias: false, preserveDrawingBuffer: false, powerPreference: "high-performance" }); if (context) { context.clear(context.COLOR_BUFFER_BIT); context.finish(); } postMessage(Boolean(context) && !context.isContextLost()); context?.getExtension("WEBGL_lose_context")?.loseContext(); } catch { postMessage(false); } close();'
              ], { type: 'text/javascript' });
              const url = URL.createObjectURL(source);
              let worker;
              let timeout;
              const cleanup = () => { clearTimeout(timeout); worker?.terminate(); URL.revokeObjectURL(url); };
              try {
                performance.mark('webgl-prewarm-start');
                worker = new Worker(url);
                worker.onmessage = (event) => {
                  if (event.data) {
                    performance.mark('webgl-prewarm-end');
                    performance.measure('webgl-prewarm', 'webgl-prewarm-start', 'webgl-prewarm-end');
                  } else performance.mark('webgl-prewarm-unavailable');
                  cleanup();
                };
                worker.onerror = (event) => { event.preventDefault(); cleanup(); };
                timeout = setTimeout(cleanup, 2000);
              } catch { cleanup(); }
            }
          }`,
        }],
      }
    },
  }
}
