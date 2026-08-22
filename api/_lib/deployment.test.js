/**
 * Deployment budget guard.
 *
 * Vercel turns every file under `api/` into a Serverless Function unless it
 * lives in an underscore-prefixed path (`api/_lib/…`) or is excluded by
 * `.vercelignore`. The Hobby plan caps a deployment at 12, and exceeding it
 * fails the deploy with:
 *
 *   No more than 12 Serverless Functions can be added to a Deployment on the
 *   Hobby plan.
 *
 * That failure only shows up at deploy time, so it is asserted here instead.
 *
 * Run: node --test --experimental-test-module-mocks "api/**\/*.test.js"
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const apiDir = path.join(repoRoot, 'api');

const HOBBY_FUNCTION_LIMIT = 12;
// Leave room for a couple of future endpoints before anyone has to consolidate.
const HEADROOM = 2;

/** Mirrors how Vercel decides what becomes a Serverless Function. */
function collectFunctions(dir, relative = '') {
    const functions = [];

    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        // Underscore-prefixed files and directories are never functions.
        if (entry.name.startsWith('_') || entry.name.startsWith('.')) continue;

        const rel = relative ? `${relative}/${entry.name}` : entry.name;

        if (entry.isDirectory()) {
            functions.push(...collectFunctions(path.join(dir, entry.name), rel));
            continue;
        }

        if (!/\.(js|mjs|ts)$/.test(entry.name)) continue;
        // Excluded from the upload by .vercelignore.
        if (entry.name.endsWith('.test.js')) continue;

        functions.push(`api/${rel}`);
    }

    return functions;
}

test('the deployment stays within the Vercel Hobby function limit', () => {
    const functions = collectFunctions(apiDir).sort();
    const budget = HOBBY_FUNCTION_LIMIT - HEADROOM;

    assert.ok(
        functions.length <= budget,
        `${functions.length} Serverless Functions (budget ${budget}, hard limit ${HOBBY_FUNCTION_LIMIT}).\n` +
        `Consolidate related endpoints behind an ?action= router (see api/battle.js) or move a\n` +
        `helper into api/_lib/. Current functions:\n  ${functions.join('\n  ')}`
    );
});

test('test files are excluded from the deployment', () => {
    const vercelignore = fs.readFileSync(path.join(repoRoot, '.vercelignore'), 'utf8');
    assert.ok(
        vercelignore.split('\n').some((line) => line.trim() === '*.test.js'),
        '.vercelignore must exclude *.test.js — each api/*.test.js would otherwise count as a function'
    );
});

test('.vercelignore keeps everything the build needs', () => {
    const vercelignore = fs.readFileSync(path.join(repoRoot, '.vercelignore'), 'utf8');
    const active = vercelignore
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('#'));

    // .vercelignore also filters the upload to the BUILD container. `prebuild`
    // runs scripts/generate-collections-index.mjs, so excluding scripts/ (or
    // collections/) would break the build itself.
    for (const required of ['scripts', 'scripts/', 'collections', 'collections/', 'src', 'src/', 'api', 'api/']) {
        assert.ok(!active.includes(required), `.vercelignore must not exclude "${required}" — the build needs it`);
    }
});

test('every deployed function exports a default handler', () => {
    // Checked statically: importing the modules here would instantiate the KV
    // client and interfere with the suites that mock it.
    for (const relative of collectFunctions(apiDir)) {
        const source = fs.readFileSync(path.join(repoRoot, relative), 'utf8');
        assert.match(
            source,
            /export\s+default\s+(async\s+)?(function|withCors|\w+)/,
            `${relative} must export a default request handler`
        );
    }
});
