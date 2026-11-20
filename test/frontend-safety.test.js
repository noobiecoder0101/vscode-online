import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const PUBLIC_DIR = join(process.cwd(), 'public');
const SCRIPTS_DIR = join(PUBLIC_DIR, 'scripts');

function stripComments(code) {
  return code.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');
}

test('frontend safety: no unsafe DOM sinks in public/scripts (except scripts.js)', async () => {
  const files = await readdir(SCRIPTS_DIR);
  const jsFiles = files.filter(f => f.endsWith('.js') && f !== 'scripts.js');
  const forbiddenPatterns = [
    /\binnerHTML\b/,
    /\binsertAdjacentHTML\b/,
    /\bdocument\.write\b/,
    /\beval\s*\(/
  ];

  for (const file of jsFiles) {
    const rawContent = await readFile(join(SCRIPTS_DIR, file), 'utf8');
    const content = stripComments(rawContent);
    for (const pattern of forbiddenPatterns) {
      assert.strictEqual(
        pattern.test(content),
        false,
        `File ${file} contains forbidden pattern ${pattern}`
      );
    }
  }
});

test('frontend safety: no inline scripts, styles, or inline event handlers in html', async () => {
  const files = await readdir(PUBLIC_DIR);
  const htmlFiles = files.filter(f => f.endsWith('.html'));

  const inlineScriptPattern = /<script(?![^>]*\bsrc\b)[^>]*>[\s\S]*?<\/script>/i;
  const inlineStylePattern = /\bstyle\s*=\s*["'][^"']*["']/i;
  const inlineEventHandlerPattern = /\bon[a-z]+\s*=\s*["'][^"']*["']/i;

  for (const file of htmlFiles) {
    const content = await readFile(join(PUBLIC_DIR, file), 'utf8');

    assert.strictEqual(
      inlineScriptPattern.test(content),
      false,
      `File ${file} contains inline <script>`
    );

    assert.strictEqual(
      inlineStylePattern.test(content),
      false,
      `File ${file} contains inline style attribute`
    );

    assert.strictEqual(
      inlineEventHandlerPattern.test(content),
      false,
      `File ${file} contains inline event handler`
    );
  }
});

test('frontend safety: pages loading app.css have title and html lang', async () => {
  const files = await readdir(PUBLIC_DIR);
  const htmlFiles = files.filter(f => f.endsWith('.html'));

  const linkCssPattern = /<link[^>]+href=["'][^"']*app\.css["'][^>]*>/i;
  const langPattern = /<html[^>]+lang=["'][a-zA-Z-]+["'][^>]*>/i;
  const titlePattern = /<title>[^<]+<\/title>/i;

  for (const file of htmlFiles) {
    const content = await readFile(join(PUBLIC_DIR, file), 'utf8');
    if (linkCssPattern.test(content)) {
      assert.strictEqual(
        langPattern.test(content),
        true,
        `File ${file} links app.css but lacks valid lang attribute on <html>`
      );
      assert.strictEqual(
        titlePattern.test(content),
        true,
        `File ${file} links app.css but lacks non-empty <title>`
      );
    }
  }
});
