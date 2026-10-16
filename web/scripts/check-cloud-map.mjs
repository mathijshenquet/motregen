// Run against a Vite dev server: node scripts/check-cloud-map.mjs http://127.0.0.1:4390/
import { chromium } from '@playwright/test';
const browser = await chromium.launch({ args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader'] });
try {
    const page = await browser.newPage();
    await page.goto(process.argv[2] ?? 'http://127.0.0.1:4390/', { waitUntil: 'domcontentloaded' });
    const result = await page.evaluate(async () => {
        const { cloudMapFragment, cloudFlowFragment } = await import('/src/core/cloud-map-shader.ts');
        const { fieldSampling } = await import('/src/core/isoline-layer.ts');
        const { CLOUD_FLOW_DOWNSAMPLE, CLOUD_FLOW_HOURS } = await import('/src/core/cloud-map.ts');
        const width = 384, height = 256, size = 64, depth = 4;
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: false, preserveDrawingBuffer: true });
        if (!gl)
            throw Error('No WebGL2');
        const compile = (type, source) => { const shader = gl.createShader(type); gl.shaderSource(shader, source); gl.compileShader(shader); if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
            throw Error(gl.getShaderInfoLog(shader)); return shader; };
        const vertex = compile(gl.VERTEX_SHADER, '#version 300 es\nin vec2 pos;out vec2 v_uv;void main(){gl_Position=vec4(pos,0,1);v_uv=pos*0.5+0.5;}');
        if (!gl.getExtension('EXT_color_buffer_float'))
            throw Error('No float render target');
        const motion = gl.createProgram();
        gl.attachShader(motion, vertex);
        gl.attachShader(motion, compile(gl.FRAGMENT_SHADER, cloudFlowFragment(fieldSampling)));
        gl.linkProgram(motion);
        if (!gl.getProgramParameter(motion, gl.LINK_STATUS))
            throw Error(gl.getProgramInfoLog(motion));
        const travel = gl.createTexture();
        gl.activeTexture(gl.TEXTURE3);
        gl.bindTexture(gl.TEXTURE_2D, travel);
        const tw = Math.ceil(width / CLOUD_FLOW_DOWNSAMPLE), th = Math.ceil(height / CLOUD_FLOW_DOWNSAMPLE);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, tw, th, 0, gl.RGBA, gl.FLOAT, null);
        for (const p of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER])
            gl.texParameteri(gl.TEXTURE_2D, p, gl.NEAREST);
        const target = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, target);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, travel, 0);
        if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE)
            throw Error('Incomplete float target');
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        const fragment = compile(gl.FRAGMENT_SHADER, cloudMapFragment(fieldSampling));
        const program = gl.createProgram();
        gl.attachShader(program, vertex);
        gl.attachShader(program, fragment);
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS))
            throw Error(gl.getProgramInfoLog(program));
        gl.useProgram(program);
        const buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
        const pos = gl.getAttribLocation(program, 'pos');
        gl.enableVertexAttribArray(pos);
        gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);
        const texture = (unit, format) => { const tex = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_3D, tex); gl.texStorage3D(gl.TEXTURE_3D, 1, format, size, size, depth); for (const p of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER])
            gl.texParameteri(gl.TEXTURE_3D, p, gl.LINEAR); for (const p of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T, gl.TEXTURE_WRAP_R])
            gl.texParameteri(gl.TEXTURE_3D, p, gl.CLAMP_TO_EDGE); return tex; };
        const field = texture(0, gl.RGBA16F), flow = texture(1, gl.RG16F);
        const uniform = name => gl.getUniformLocation(program, name);
        gl.uniform1i(uniform('u_cloud_travel'), 3);
        gl.uniform2f(uniform('u_cloud_fill_size'), width, height);
        gl.uniform1i(uniform('u_field'), 0);
        gl.uniform1i(uniform('u_cloud_flow'), 1);
        gl.uniform2f(uniform('u_grid_size'), size, size);
        gl.uniform1f(uniform('u_depth'), depth);
        gl.uniform2f(uniform('u_cloud_origin'), 330000, 7250000);
        gl.uniform2f(uniform('u_cloud_extent'), 420000, -420000);
        gl.uniform1f(uniform('u_cloud_enabled'), 1);
        gl.uniform1f(uniform('u_cloud_night'), 0);
        gl.uniform1f(uniform('u_cloud_sample'), 0);
        const draw = (cached, phase, time) => {
            phase *= CLOUD_FLOW_HOURS / 2;
            if (cached) {
                gl.useProgram(motion);
                gl.bindFramebuffer(gl.FRAMEBUFFER, target);
                gl.viewport(0, 0, tw, th);
                const mp = gl.getAttribLocation(motion, 'pos');
                gl.enableVertexAttribArray(mp);
                gl.vertexAttribPointer(mp, 2, gl.FLOAT, false, 0, 0);
                const mu = n => gl.getUniformLocation(motion, n);
                gl.uniform1i(mu('u_cloud_flow'), 1);
                gl.uniform1f(mu('u_time'), time);
                gl.uniform1f(mu('u_depth'), depth);
                gl.uniform2f(mu('u_grid_size'), size, size);
                gl.uniform1f(mu('u_cloud_phase'), phase);
                gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
            }
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            gl.useProgram(program);
            gl.enableVertexAttribArray(pos);
            gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);
            gl.uniform1f(uniform('u_cloud_cached'), cached ? 1 : 0);
            gl.uniform1f(uniform('u_cloud_phase'), phase);
            gl.uniform1f(uniform('u_time'), time);
            gl.viewport(0, 0, width, height);
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        };
        const render = ({ shape = 0, cover = 0.55, phase = 2, compression = 0, translate = 0, ramp = false, time = 1.5, cached = true, swirl = 0, bulk = translate, drift = false } = {}) => {
            const cells = new Float32Array(size * size * depth * 4), wind = new Float32Array(size * size * depth * 2);
            for (let layer = 0; layer < depth; layer++)
                for (let row = 0; row < size; row++)
                    for (let col = 0; col < size; col++) {
                        const at = (layer * size * size + row * size + col), x = (col + 0.5) / size, y = (row + 0.5) / size;
                        cells[at * 4] = cover * 100;
                        cells[at * 4 + 1] = 1;
                        cells[at * 4 + 2] = shape === 'gradient' ? col / (size - 1) : shape;
                        cells[at * 4 + 3] = 0.45;
                        wind[at * 2] = (swirl * Math.sin(y * 12) + translate + (ramp ? 0.015 * layer : 0) - compression * (x - 0.5)) * size;
                        wind[at * 2 + 1] = (-swirl * Math.sin(x * 12) - compression * (y - 0.5)) * size;
                    }
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_3D, field);
            gl.texSubImage3D(gl.TEXTURE_3D, 0, 0, 0, 0, size, size, depth, gl.RGBA, gl.FLOAT, cells);
            gl.activeTexture(gl.TEXTURE1);
            gl.bindTexture(gl.TEXTURE_3D, flow);
            gl.texSubImage3D(gl.TEXTURE_3D, 0, 0, 0, 0, size, size, depth, gl.RG, gl.FLOAT, wind);
            gl.useProgram(program);
            const age = phase * CLOUD_FLOW_HOURS / 2, otherAge = (age + CLOUD_FLOW_HOURS / 2) % CLOUD_FLOW_HOURS;
            gl.uniform4f(uniform('u_cloud_anchor'), drift ? bulk * (time - age) : 0, 0, drift ? bulk * (time - otherAge) : 0, 0);
            draw(cached, phase, time);
            const pixels = new Uint8Array(width * height * 4);
            gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
            if (gl.getError() !== gl.NO_ERROR)
                throw Error('WebGL error');
            return pixels;
        };
        const tau = (pixels, at, cover = 0.55) => -Math.log(Math.max(0.0001, (1 - pixels[at * 4 + 3] / 255) / (1 - cover * 0.45 * 0.15)));
        const average = (pixels, cover) => { let sum = 0, count = 0; for (let y = height / 4; y < height * 3 / 4; y++)
            for (let x = width / 4; x < width * 3 / 4; x++) {
                sum += tau(pixels, y * width + x, cover);
                count++;
            } return sum / count; };
        const low = render({ shape: 0 }), mid = render({ shape: 0.55 }), high = render({ shape: 1 }), mixed = render({ shape: 'gradient' });
        const smooth = t => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
        let blendSum = 0, blendMax = 0, count = 0;
        for (let y = 8; y < height - 8; y++)
            for (let x = 8; x < width - 8; x++) {
                const b = (((x + 0.5) / width) * size - 0.5) / (size - 1), lo = 1 - smooth(b / 0.55), hi = smooth((b - 0.55) / 0.45), mi = 1 - lo - hi, at = y * width + x;
                const expected = lo * tau(low, at) + mi * tau(mid, at) + hi * tau(high, at);
                const error = Math.abs(tau(mixed, at) - expected);
                blendSum += error;
                blendMax = Math.max(blendMax, error);
                count++;
            }
        const before = render({ translate: 0.08, phase: 0.9, time: 0.225, drift: true }), after = render({ translate: 0.08, phase: 1.1, time: 0.275, drift: true });
        const corr = (a, b, dx) => { let aa = 0, bb = 0, ab = 0, sa = 0, sb = 0, n = 0; for (let y = 16; y < height - 16; y++)
            for (let x = 32; x < width - 32; x++) {
                const va = a[(y * width + x) * 4 + 3], vb = b[(y * width + x + dx) * 4 + 3];
                aa += va * va;
                bb += vb * vb;
                ab += va * vb;
                sa += va;
                sb += vb;
                n++;
            } return (ab - sa * sb / n) / Math.sqrt((aa - sa * sa / n) * (bb - sb * sb / n)); };
        const shifted = corr(before, after, Math.round(0.08 * 0.2 * width * CLOUD_FLOW_HOURS / 2)), stationary = corr(before, after, 0);
        const reference = average(render({ cover: 1 }), 1);
        const compressed = average(render({ cover: 1, compression: 0.2 }), 1) / reference;
        const diluted = average(render({ cover: 1, compression: -0.2 }), 1) / reference;
        const mae = (a, b) => { let sum = 0; for (let at = 3; at < a.length; at += 4)
            sum += Math.abs(a[at] - b[at]); return sum / (width * height); };
        const cycleError = mae(render({ translate: 0.08, phase: 1.999 }), render({ translate: 0.08, phase: 0.001 }));
        const hourError = mae(render({ translate: 0.04, ramp: true, phase: 0.999, time: 1.999 }), render({ translate: 0.04, ramp: true, phase: 2.001, time: 2.001 }));
        const cycleFine = mae(render({ translate: 0.08, phase: 1.9999 }), render({ translate: 0.08, phase: 0.0001 }));
        const cycleExact = mae(render({ translate: 0.08, phase: 2 }), render({ translate: 0.08, phase: 0 }));
        const hourFine = mae(render({ translate: 0.04, ramp: true, phase: 0.9999, time: 1.9999 }), render({ translate: 0.04, ramp: true, phase: 2.0001, time: 2.0001 }));
        const stressed = render({ cover: 1, compression: 2 });
        let maxStressAlpha = 0;
        for (let at = 3; at < stressed.length; at += 4)
            maxStressAlpha = Math.max(maxStressAlpha, stressed[at]);
        const sought = render({ translate: 0.08, phase: 0.9, time: 0.225, drift: true });
        let repeatDifferences = 0;
        for (let at = 0; at < sought.length; at++)
            if (sought[at] !== before[at])
                repeatDifferences++;
        const travelStart = render({ translate: 0.08, phase: 0, time: 0, drift: true });
        const travelEnd = render({ translate: 0.08, phase: 0, time: 1, drift: true });
        const longShifted = corr(travelStart, travelEnd, Math.round(0.08 * width));
        const longStationary = corr(travelStart, travelEnd, 0);
        if (longShifted < 0.95 || longShifted < longStationary + 0.1)
            throw Error('Texture rewinds across renewal: ' + JSON.stringify({ longShifted, longStationary }));
        const residual = render({ translate: 0.08, bulk: 0.02, phase: 0.5, time: 1, drift: true });
        const coherent = render({ translate: 0.08 * 0.25 + 0.02 * 0.75, phase: 1, time: 1, drift: true });
        const residualError = mae(residual, coherent);
        if (residualError > 0.2)
            throw Error('Crossfade makes displaced duplicate clouds: ' + residualError);
        const checks = { residual_single_trajectory_alpha_mae: residualError, long_translation_shifted_correlation: longShifted, long_translation_stationary_correlation: longStationary, strong_compression_max_alpha: maxStressAlpha, type_blend_mean_error: blendSum / count, type_blend_max_error: blendMax, translation_shifted_correlation: shifted, translation_stationary_correlation: stationary, compressed_density_ratio: compressed, compressed_expected: 1, diluted_density_ratio: diluted, diluted_expected: 1, cycle_alpha_mae: cycleError, hour_alpha_mae: hourError, cycle_fine_alpha_mae: cycleFine, cycle_exact_alpha_mae: cycleExact, hour_fine_alpha_mae: hourFine, reseek_byte_differences: repeatDifferences };
        const comparisons = [];
        for (const input of [{ translate: 0.08 }, { compression: 0.2 }, { compression: -0.2 }, { compression: 2 }, { swirl: 0.05 }, { swirl: 0.15 }]) {
            const a = render({ ...input, phase: 1.4, shape: 'gradient', cached: false }), b = render({ ...input, phase: 1.4, shape: 'gradient', cached: true });
            let sum = 0, max = 0, over = 0;
            for (let i = 3; i < a.length; i += 4) {
                const d = Math.abs(a[i] - b[i]);
                sum += d;
                max = Math.max(max, d);
                if (d > 8)
                    over++;
            }
            comparisons.push({ input, alpha_mae: sum / (width * height), max, over8: over / (width * height) });
        }
        checks.comparisons = comparisons;
        return checks;
    });
    console.log(JSON.stringify(result));
    const failures = [];
    if (result.strong_compression_max_alpha > 145)
        failures.push('compression opacity bound');
    if (result.type_blend_mean_error > 0.006 || result.type_blend_max_error > 0.035)
        failures.push('type blend');
    if (result.translation_shifted_correlation < 0.95 || result.translation_shifted_correlation < result.translation_stationary_correlation + 0.1)
        failures.push('translation');
    if (Math.abs(result.compressed_density_ratio / result.compressed_expected - 1) > 0.06 || Math.abs(result.diluted_density_ratio / result.diluted_expected - 1) > 0.06)
        failures.push('unjustified surface-wind density');
    if (result.cycle_fine_alpha_mae > 0.2 || result.cycle_fine_alpha_mae > result.cycle_alpha_mae * 0.3 || result.hour_fine_alpha_mae > 0.2 || result.hour_fine_alpha_mae > result.hour_alpha_mae * 0.3 || result.cycle_exact_alpha_mae !== 0 || result.reseek_byte_differences)
        failures.push('continuity/reseek');
    if (result.comparisons.some(c => c.alpha_mae > 1 || c.over8 > 0.02))
        failures.push('cached flow image error');
    if (failures.length)
        throw Error('GPU validation failed: ' + failures.join(', '));
    console.log('GPU flow, type blending, density, boundaries and reseek verified');
}
finally {
    await browser.close();
}
