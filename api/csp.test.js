/**
 * CSP regression guard.
 *
 * The deployed Content-Security-Policy has no `'unsafe-inline'` in script-src,
 * so a single inline `onclick=` / `onerror=` attribute (or an inline <script>)
 * silently breaks that feature in production. This test fails fast instead.
 *
 * Run: node --test --experimental-test-module-mocks "api/**\/*.test.js"
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { normalizeReports, toOrigin } from './csp-report.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function walk(dir, files = []) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full, files);
        else if (entry.name.endsWith('.js')) files.push(full);
    }
    return files;
}

const INLINE_HANDLER_RE = /\son(?:click|error|load|change|submit|input|mouseover|focus|blur)\s*=\s*["'`]/i;

test('no inline event handlers in client templates', () => {
    const offenders = [];

    for (const file of walk(path.join(repoRoot, 'src'))) {
        const source = fs.readFileSync(file, 'utf8');
        source.split('\n').forEach((line, index) => {
            // Skip comments — several files document the old pattern.
            const trimmed = line.trim();
            if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return;
            if (INLINE_HANDLER_RE.test(line)) {
                offenders.push(`${path.relative(repoRoot, file)}:${index + 1} → ${trimmed.slice(0, 90)}`);
            }
        });
    }

    assert.deepEqual(offenders, [], `Inline handlers break the CSP:\n${offenders.join('\n')}`);
});

test('index.html contains no inline script', () => {
    const html = fs.readFileSync(path.join(repoRoot, 'index.html'), 'utf8');
    const scripts = [...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)];

    for (const [, attrs, body] of scripts) {
        assert.equal(body.trim(), '', `Inline script found (attrs: ${attrs.trim()})`);
    }
});

test('the deployed CSP keeps script-src free of unsafe-inline', () => {
    const vercel = JSON.parse(fs.readFileSync(path.join(repoRoot, 'vercel.json'), 'utf8'));
    const globalHeaders = vercel.headers.find((h) => h.source === '/(.*)');
    const csp = globalHeaders.headers.find((h) => h.key === 'Content-Security-Policy');

    assert.ok(csp, 'a Content-Security-Policy header must be configured');

    const scriptSrc = csp.value.split(';').map((d) => d.trim()).find((d) => d.startsWith('script-src'));
    assert.ok(scriptSrc, 'script-src must be set explicitly');
    assert.ok(!scriptSrc.includes("'unsafe-inline'"), "script-src must not allow 'unsafe-inline'");
    assert.ok(!scriptSrc.includes("'unsafe-eval'"), "script-src must not allow 'unsafe-eval'");

    assert.ok(csp.value.includes("object-src 'none'"));
    assert.ok(csp.value.includes("base-uri 'self'"));

    // The mini app is embedded by Farcaster / Base App hosts: locking framing
    // down would make it unopenable there.
    assert.ok(!csp.value.includes('frame-ancestors'), 'frame-ancestors must stay unset for mini-app embedding');
    assert.ok(
        !globalHeaders.headers.some((h) => h.key.toLowerCase() === 'x-frame-options'),
        'X-Frame-Options would break mini-app embedding'
    );
});


// ── report collector ───────────────────────────────────────────

test('parses the CSP2 report shape', () => {
    const reports = normalizeReports({
        'csp-report': {
            'document-uri': 'https://app.example.com/battle?x=1',
            'violated-directive': "script-src 'self'",
            'effective-directive': 'script-src',
            'blocked-uri': 'https://evil.example.com/inject.js?a=b'
        }
    });

    assert.equal(reports.length, 1);
    assert.equal(reports[0].directive, 'script-src');
    assert.equal(reports[0].blockedOrigin, 'https://evil.example.com');
    assert.equal(reports[0].documentUri, 'https://app.example.com');
});

test('parses the Reporting API shape and ignores other report types', () => {
    const reports = normalizeReports([
        { type: 'csp-violation', body: { effectiveDirective: 'connect-src', blockedURL: 'https://api.other.com/x' } },
        { type: 'deprecation', body: { id: 'something-else' } }
    ]);

    assert.equal(reports.length, 1);
    assert.equal(reports[0].directive, 'connect-src');
    assert.equal(reports[0].blockedOrigin, 'https://api.other.com');
});

test('keyword sources survive, and cardinality stays bounded', () => {
    assert.equal(toOrigin('inline'), 'inline');
    assert.equal(toOrigin('eval'), 'eval');
    assert.equal(toOrigin(''), 'unknown');
    // Query strings and paths are stripped so counters cannot explode.
    assert.equal(toOrigin('https://cdn.example.com/a/b/c.js?v=123'), 'https://cdn.example.com');
    assert.ok(toOrigin('x'.repeat(500)).length <= 80);
});

test('a burst of reports is capped per request', () => {
    const many = new Array(100).fill({ type: 'csp-violation', body: { effectiveDirective: 'img-src' } });
    assert.equal(normalizeReports(many).length, 10);
});

test('garbage payloads produce no reports', () => {
    assert.deepEqual(normalizeReports(null), []);
    assert.deepEqual(normalizeReports({}), [], 'an empty report carries no information');
    assert.deepEqual(normalizeReports({ 'csp-report': {} }), []);
    assert.deepEqual(normalizeReports([null, 'nope']), []);
});

test('the report-only policy points at the collector', () => {
    const vercel = JSON.parse(fs.readFileSync(path.join(repoRoot, 'vercel.json'), 'utf8'));
    const globalHeaders = vercel.headers.find((h) => h.source === '/(.*)');
    const reportOnly = globalHeaders.headers.find((h) => h.key === 'Content-Security-Policy-Report-Only');
    const reportingEndpoints = globalHeaders.headers.find((h) => h.key === 'Reporting-Endpoints');

    assert.ok(reportOnly.value.includes('report-uri /api/csp-report'));
    assert.ok(reportOnly.value.includes('report-to csp-endpoint'));
    assert.ok(reportingEndpoints.value.includes('/api/csp-report'));
});
