// Pul hisob-kitobi regressiya testlari: tests/*.test.ts → esbuild → node:test.
// Ishga tushirish: npm test  (electron:build ham avval shuni ishga tushiradi —
// test yiqilsa o'rnatuvchi yig'ilmaydi va eski xato mijozga qaytib bormaydi).
import { build } from 'esbuild';
import { readdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const files = readdirSync(here).filter(f => f.endsWith('.test.ts'));
const outDir = mkdtempSync(join(tmpdir(), 'denta-tests-'));

try {
    const outputs = [];
    for (const f of files) {
        const outfile = join(outDir, f.replace(/\.ts$/, '.cjs'));
        await build({ entryPoints: [join(here, f)], bundle: true, platform: 'node', format: 'cjs', outfile, logLevel: 'error' });
        outputs.push(outfile);
    }
    const result = spawnSync(process.execPath, ['--test', ...outputs], { stdio: 'inherit' });
    process.exitCode = result.status ?? 1;
} finally {
    rmSync(outDir, { recursive: true, force: true });
}
