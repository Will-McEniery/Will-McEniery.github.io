import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Browser scripts that unit tests don't import (they need a DOM) still get a parse check.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = fs.readdirSync(path.join(root, 'assets/js'), { recursive: true })
    .filter((f) => f.endsWith('.js'))
    .map((f) => path.join(root, 'assets/js', f));

test('every browser script parses', () => {
    assert.ok(files.length > 5);
    for (const file of files) {
        assert.doesNotThrow(() => execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' }), `syntax error in ${file}`);
    }
});
