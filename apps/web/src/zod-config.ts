import { useJitlessZod } from '@app/domain/zod-jitless';

/*
 * Review fixes 2026-09-30 (security L11): imported first by `main.tsx`, so zod never probes
 * `Function('')` under the shell's Content Security Policy. zod reads the flag when a schema
 * is created, so this runs before any kernel schema exists: it imports the kernel's zod-only
 * entry (`@app/domain/zod-jitless`), never its index.
 */
useJitlessZod();
