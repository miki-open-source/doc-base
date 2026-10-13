import { build, type AstroInlineConfig } from "astro";

// Astro's prerender output must be isolated beneath this process's working directory.
await build(JSON.parse(process.argv[2]) as AstroInlineConfig);
