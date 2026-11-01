import {
  mkdir,
  readFile,
  writeFile,
  rm,
  readdir,
  cp,
  access,
  symlink,
} from "node:fs/promises";
import path from "node:path";
import { promoteDirectory } from "./directories.js";
import { pathToFileURL, fileURLToPath } from "node:url";
import { createServer, type ServerResponse } from "node:http";
import { createConnection } from "node:net";
import type { Duplex } from "node:stream";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
type DevServer = Awaited<ReturnType<typeof dev>>;
import { createHash, randomUUID } from "node:crypto";
import { dev, type AstroInlineConfig } from "astro";
const execute = promisify(execFile);
import {
  DocBaseError,
  diagnostic,
  stableJson,
  VERSION,
  type Compilation,
  type NavEntry,
} from "@doc-base/schema";
export async function checkCompatibility(): Promise<Record<string, string>> {
  const versions: Record<string, string> = {};
  for (const name of ["astro", "@astrojs/starlight"]) {
    let directory = path.dirname(fileURLToPath(import.meta.resolve(name)));
    while (path.dirname(directory) !== directory) {
      try {
        const pkg = JSON.parse(
          await readFile(path.join(directory, "package.json"), "utf8"),
        ) as { name: string; version: string };
        if (pkg.name === name) {
          versions[name] = pkg.version;
          break;
        }
      } catch {
        /* Search package parents. */
      }
      directory = path.dirname(directory);
    }
  }
  if (
    !versions.astro?.startsWith("7.") ||
    !versions["@astrojs/starlight"]?.startsWith("0.42.")
  )
    throw new DocBaseError(2, [
      diagnostic("DBC003", "Unsupported Astro/Starlight package versions"),
    ]);
  return versions;
}
async function linkRenderingDependencies(root: string): Promise<void> {
  for (const name of [
    "astro",
    "@astrojs/starlight",
    "@astrojs/markdown-remark",
    "@doc-base/schema",
  ]) {
    let directory = path.dirname(fileURLToPath(import.meta.resolve(name)));
    while (path.dirname(directory) !== directory) {
      try {
        const pkg = JSON.parse(
          await readFile(path.join(directory, "package.json"), "utf8"),
        ) as { name: string };
        if (pkg.name === name) break;
      } catch {
        /* Search package parents. */
      }
      directory = path.dirname(directory);
    }
    const destination = path.join(root, "node_modules", name);
    await mkdir(path.dirname(destination), { recursive: true });
    await symlink(
      directory,
      destination,
      process.platform === "win32" ? "junction" : "dir",
    );
  }
}
const fingerprint = (bytes: string | Uint8Array): string =>
  createHash("sha256").update(bytes).digest("hex");
const escape = (text: string): string =>
  text.replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ]!,
  );
async function put(
  root: string,
  file: string,
  content: string | Uint8Array,
): Promise<void> {
  const target = path.join(root, file);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, content);
}
const searchComponent = `---
const label = Astro.locals.t('search.label');
const cancel = Astro.locals.t('search.cancelLabel');
---
<doc-base-search>
  <button aria-label={label} data-open>{label}</button>
  <dialog aria-label={label}>
    <form method="dialog"><button>{cancel}</button></form>
    <label>{label}<input type="search" placeholder={label} /></label>
    <p role="status" aria-live="polite"></p><ul></ul>
  </dialog>
</doc-base-search>
<script>
import {foldCase} from '@doc-base/schema';
class DocBaseSearch extends HTMLElement {
  connectedCallback() {
    const dialog=this.querySelector('dialog')!; const input=this.querySelector('input')!; const list=this.querySelector('ul')!; const status=this.querySelector('[role=status]')!;
    let records: Array<{url:string;title:string;description?:string;bodyText?:string;tags:string[];headings:Array<{text:string}>;boost:number;metadata?:Record<string,unknown>}> = [];
    dialog.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();dialog.close();}});
    const load=fetch(import.meta.env.BASE_URL.replace(/\\/?$/, '/')+'_doc-base/search.json').then(response=>{if(!response.ok)throw new Error('Search unavailable');return response.json();}).then(data=>{records=data;}).catch(()=>{status.textContent='Search is unavailable.';});
    this.querySelector('[data-open]')!.addEventListener('click',()=>{dialog.showModal();input.focus();});
    document.addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&event.key==='k'){event.preventDefault();dialog.showModal();input.focus();}});
    input.addEventListener('input',async()=>{await load;const query=foldCase(input.value).trim();list.replaceChildren();if(!query){status.textContent='';return;}
      const results=records.map(record=>({record,score:(foldCase([record.title,record.description,record.bodyText,...record.tags,...record.headings.map(h=>h.text),JSON.stringify(record.metadata ?? {})].join(' ')).includes(query)?1:0)*record.boost})).filter(item=>item.score>0).sort((a,b)=>b.score-a.score).slice(0,30);
      for(const {record} of results){const item=document.createElement('li');const link=document.createElement('a');link.href=record.url;link.textContent=record.title;item.append(link);list.append(item);}status.textContent=results.length+' results';
    });
  }
}
if(!customElements.get('doc-base-search'))customElements.define('doc-base-search',DocBaseSearch);
</script>
<style>dialog{width:min(40rem,90vw);padding:1.5rem;border:1px solid var(--sl-color-gray-4);border-radius:.5rem;background:var(--sl-color-bg);color:var(--sl-color-text)}input{display:block;width:100%;padding:.7rem;margin-top:.5rem}li{margin-block:.7rem}button{cursor:pointer;padding:.5rem 1rem}dialog::backdrop{background:#0008}</style>
`;
const developmentBanner = `---
import Default from '@astrojs/starlight/components/Banner.astro';
---
<Default {...Astro.props} />
<aside data-development-status role="alert" hidden></aside>
<script>
const banner=document.querySelector<HTMLElement>('[data-development-status]')!;
const events=new EventSource(import.meta.env.BASE_URL.replace(/\\/?$/, '/')+'_doc-base/development-events');
let generation:string|undefined;
events.onmessage=event=>{
  const status=JSON.parse(event.data) as {generation:string;stale:boolean;message:string};
  if(generation && generation!==status.generation){location.reload();return;}
  generation=status.generation;banner.hidden=!status.stale;
  banner.textContent=status.stale?'Output is stale. '+status.message:'';
};
</script>
<style>aside{padding:1rem;background:#8b2300;color:white;font-weight:bold}aside[hidden]{display:none}</style>
`;
function starlightNavigation(entries: NavEntry[], baseUrl: string): NavEntry[] {
  return entries.map((entry) => ({
    ...entry,
    ...(entry.link?.startsWith(baseUrl)
      ? { link: "/" + entry.link.slice(baseUrl.length) }
      : {}),
    ...(entry.items
      ? { items: starlightNavigation(entry.items, baseUrl) }
      : {}),
  }));
}
export async function generate(
  compilation: Compilation,
  options: { retainGeneration?: boolean } = {},
): Promise<string> {
  compilation.options.signal?.throwIfAborted();
  if (!compilation.ok) throw new DocBaseError(1, compilation.diagnostics);
  const generated = path.join(compilation.projectDir, ".doc-base", "generated");
  const staging = generated + "-" + randomUUID();
  const generation = path.join(
    compilation.projectDir,
    ".doc-base",
    "generation-" + randomUUID(),
  );
  await mkdir(staging, { recursive: true });
  try {
    await put(
      staging,
      "manifest.json",
      stableJson({
        schemaVersion: 1,
        generatorVersion: VERSION,
        projections: compilation.projections.map((item) => item.audience),
      }),
    );
    for (const projection of compilation.projections) {
      const root = path.join(staging, projection.audience ?? "default");
      await linkRenderingDependencies(root);
      await put(root, "package.json", '{"type":"module","private":true}\n');
      for (const directory of ["src", "public"]) {
        const customizationSource = path.join(
          compilation.projectDir,
          directory,
        );
        try {
          await access(customizationSource);
          await cp(customizationSource, path.join(root, directory), {
            recursive: true,
          });
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        }
      }
      for (const source of compilation.sources) {
        for (const [sourcePath, bytes] of source.files) {
          if (!/\.mdx?$/.test(sourcePath))
            await put(
              root,
              `src/source-content/${source.id}/${sourcePath}`,
              bytes,
            );
        }
      }

      await put(
        root,
        "src/content.config.ts",
        `import {defineCollection} from 'astro:content';\nimport {docsLoader} from '@astrojs/starlight/loaders';\nimport {docsSchema} from '@astrojs/starlight/schema';\nexport const collections={docs:defineCollection({loader:docsLoader({generateId:({data})=>(data.slug ? String(data.slug).replace(/\\/$/,'')+'/' : '')+'index'}),schema:docsSchema()})};\n`,
      );
      await put(
        root,
        "src/components/Search.astro",
        compilation.config.search.enabled ? searchComponent : "---\n---\n",
      );
      if (compilation.options.dev)
        await put(
          root,
          "src/components/DevelopmentBanner.astro",
          developmentBanner,
        );
      await put(
        root,
        "metadata.json",
        stableJson(
          projection.pages.map((page) => ({
            url: page.url,
            metadata: page.metadata,
          })),
        ),
      );
      await put(
        root,
        "src/components/Metadata.astro",
        `---
import pages from '../../metadata.json';
const current=pages.find(page=>page.url.replace(/\\/$/,'')===Astro.url.pathname.replace(/\\/$/,''));
const items=current?.metadata.filter(item=>item.placement===Astro.props.placement) ?? [];
---
{items.length>0 && <section aria-label="Document metadata"><dl>{items.map(item=><><dt>{item.label}</dt><dd>{item.value.kind==='text'?item.value.text:item.value.kind==='link'?<a href={item.value.href}>{item.value.text}</a>:<ul>{item.value.items?.map(text=><li>{text}</li>)}</ul>}</dd></>)}</dl></section>}
<style>section{margin-block:1rem}dt{font-weight:bold}dd{margin-inline-start:0}</style>
`,
      );
      for (const [component, placement] of [
        ["PageTitle", "header"],
        ["Footer", "footer"],
        ["PageSidebar", "sidebar"],
      ]) {
        await put(
          root,
          `src/components/${component}.astro`,
          `---\nimport Default from '@astrojs/starlight/components/${component}.astro';\nimport Metadata from './Metadata.astro';\n---\n<Default {...Astro.props}><slot /></Default>\n<Metadata placement="${placement}" />\n`,
        );
      }
      const ids: Record<string, string[]> = {};
      for (const page of projection.pages) {
        const file = `document-${fingerprint(page.key)}.${page.format}`;
        ids[file] = page.headings.map((heading) => heading.id);
        const frontmatter = {
          title: page.title,
          description: page.description,
          slug: page.route || "",
          ...(projection.audience &&
          projection.audience !== compilation.config.site.defaultAudience
            ? {
                head: [
                  {
                    tag: "meta",
                    attrs: { name: "robots", content: "noindex" },
                  },
                ],
              }
            : {}),
        };
        let extras = "";
        if (Object.keys(compilation.config.audiences).length > 0)
          extras +=
            "\n\n**Audience:** " +
            compilation.projections
              .map((other) => {
                const equivalent = other.pages.find(
                  (item) => item.key === page.key,
                );
                return `[${compilation.config.audiences[other.audience!].label}${equivalent ? "" : " (page unavailable; home)"}](${equivalent?.url ?? other.baseUrl})`;
              })
              .join(" · ") +
            "\n\nAudiences filter documentation; they are not authorization.\n";
        if (page.relationships.length)
          extras +=
            "\n\n## Relationships\n\n" +
            page.relationships
              .map(
                (item) => `- **${item.label}:** [${item.title}](${item.url})`,
              )
              .join("\n") +
            "\n";
        const owner = compilation.documents.find(
          (document) => document.key === page.key,
        )!;
        const markdown =
          page.format === "mdx"
            ? page.markdown.replace(
                /((?:from\s+|import\s*)["'])(\.[^"']+)(["'])/g,
                (_match, prefix: string, specifier: string, suffix: string) => {
                  const sourceTarget = path.posix
                    .normalize(
                      path.posix.join(
                        path.posix.dirname(owner.sourcePath),
                        specifier,
                      ),
                    )
                    .normalize("NFC");
                  const target = path.join(
                    root,
                    "src/source-content",
                    owner.sourceId,
                    sourceTarget,
                  );
                  let relative = path
                    .relative(
                      path.dirname(path.join(root, "src/content/docs", file)),
                      target,
                    )
                    .split(path.sep)
                    .join("/");
                  if (!relative.startsWith(".")) relative = "./" + relative;
                  return prefix + relative + suffix;
                },
              )
            : page.markdown;
        await put(
          root,
          `src/content/docs/${file}`,
          "---\n" +
            JSON.stringify(frontmatter) +
            "\n---\n\n" +
            (page.draft
              ? "> **Draft:** This page is not included in production.\n\n"
              : "") +
            markdown +
            extras,
        );
      }
      await put(root, "headings.json", stableJson(ids));
      await put(
        root,
        "headings.mjs",
        `import {readFileSync} from 'node:fs';\nconst ids=JSON.parse(readFileSync(new URL('./headings.json',import.meta.url),'utf8'));\nexport default function(){return (tree,file)=>{const key=String(file.path).replaceAll('\\\\','/').split('/src/content/docs/')[1];let index=0;function walk(node){if(node.type==='heading'){const id=ids[key]?.[index++];if(id)node.data={...node.data,hProperties:{...node.data?.hProperties,id}};}for(const child of node.children??[])walk(child);}walk(tree);};}\n`,
      );
      let customizationImport = "const customization = {};";
      for (const filename of [
        "astro.config.mjs",
        "astro.config.js",
        "astro.config.ts",
      ]) {
        const candidate = path.join(compilation.projectDir, filename);
        try {
          await access(candidate);
          customizationImport = `import customization from ${JSON.stringify(pathToFileURL(candidate).href)};`;
          break;
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        }
      }
      let starlightImport = "const starlightOptions = {};";
      const starlightFile = path.join(
        compilation.projectDir,
        "starlight.config.mjs",
      );
      try {
        await access(starlightFile);
        starlightImport = `import starlightOptions from ${JSON.stringify(pathToFileURL(starlightFile).href)};`;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
      await put(
        root,
        "astro.config.mjs",
        `import { defineConfig, mergeConfig } from 'astro/config';
${customizationImport}
${starlightImport}
import starlight from '@astrojs/starlight';
import { unified } from '@astrojs/markdown-remark';
import { foldCase } from '@doc-base/schema';
import headings from './headings.mjs';
if (typeof customization !== 'object' || !customization) throw new Error('Astro customization must export a configuration object');
const assetPrefix = customization.build?.assets?.split('/')[0];
if (assetPrefix && ${JSON.stringify(projection.pages.map((page) => page.route))}.some(route=>foldCase(route.split('/')[0])===foldCase(assetPrefix))) throw new Error('DBU110: A document route uses the configured assets prefix');
export default defineConfig(mergeConfig(customization, {
  base: ${JSON.stringify(projection.baseUrl)},
  trailingSlash: ${JSON.stringify(compilation.config.site.trailingSlash)},
  vite: { environments: { prerender: { resolve: { noExternal: ['@astrojs/starlight'] } } }, ssr: { noExternal: ['@astrojs/starlight'] } },
  markdown: { processor: unified({ remarkPlugins: [headings] }) },
  integrations: [starlight({
    ...starlightOptions,
    title: ${JSON.stringify(compilation.config.site.title)},
    description: ${JSON.stringify(compilation.config.site.description)},
    ${compilation.config.navigation ? "sidebar: " + JSON.stringify(starlightNavigation(projection.navigation, projection.baseUrl)) + "," : ""}
    pagefind: false,
    components: {
      Search: './src/components/Search.astro',
      PageTitle: './src/components/PageTitle.astro',
      Footer: './src/components/Footer.astro',
      PageSidebar: './src/components/PageSidebar.astro',
      ...starlightOptions.components,
      ${compilation.options.dev ? "Banner: './src/components/DevelopmentBanner.astro'," : ""}
    }
  })]
}));
`,
      );
      await put(
        root,
        "public/_doc-base/search.json",
        stableJson(projection.search),
      );
      for (const [asset, bytes] of compilation.assets)
        await put(root, "public/" + asset, bytes);
    }
    if (options.retainGeneration)
      await cp(staging, generation, { recursive: true });
    await promoteDirectory(staging, generated, compilation.options.signal);
    return options.retainGeneration ? generation : generated;
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    if (options.retainGeneration)
      await rm(generation, { recursive: true, force: true });
    throw error;
  }
}
export async function assertManifest(generated: string): Promise<void> {
  const manifest = JSON.parse(
    await readFile(path.join(generated, "manifest.json"), "utf8"),
  ) as { schemaVersion: number; generatorVersion: string };
  if (
    manifest.schemaVersion !== 1 ||
    manifest.generatorVersion.split(".")[0] !== VERSION.split(".")[0]
  )
    throw new DocBaseError(1, [
      diagnostic("DBV100", "Incompatible generated manifest"),
    ]);
}
function configFor(root: string, outDir?: string): AstroInlineConfig {
  return {
    root,
    configFile: "astro.config.mjs",
    cacheDir: path.join(root, ".astro"),
    outDir,
    logLevel: "error",
  };
}
function outputFile(url: string, base: string): string {
  const relative = decodeURIComponent(url.slice(base.length)).replace(
    /^\/|\/$/g,
    "",
  );
  return relative ? `${relative}/index.html` : "index.html";
}
export async function buildSite(compilation: Compilation): Promise<string> {
  const generated = await generate(compilation, { retainGeneration: true });
  await assertManifest(generated);
  const output = path.resolve(
    compilation.projectDir,
    compilation.config.site.outputDir,
  );
  if (
    output === compilation.projectDir ||
    compilation.sources.some(
      (source) =>
        output === source.root || source.root.startsWith(output + path.sep),
    )
  )
    throw new DocBaseError(1, [
      diagnostic(
        "DBU130",
        "Output directory would overwrite project or source content",
      ),
    ]);
  try {
    await access(output);
    await access(path.join(output, "_doc-base/build-manifest.json"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    const items = await readdir(output).catch(() => []);
    if (items.length)
      throw new DocBaseError(1, [
        diagnostic(
          "DBU130",
          "Refusing to overwrite output without a doc-base manifest",
        ),
      ]);
  }
  const staging = path.join(
    compilation.projectDir,
    ".doc-base",
    "staging-" + randomUUID(),
  );
  await mkdir(staging, { recursive: true });
  try {
    for (const projection of compilation.projections) {
      const root = path.join(generated, projection.audience ?? "default");
      const destination = path.join(
        staging,
        projection.baseUrl.slice(compilation.config.site.baseUrl.length),
      );
      await execute(
        process.execPath,
        [
          fileURLToPath(new URL("./build-worker.js", import.meta.url)),
          JSON.stringify(configFor(root, destination)),
        ],
        {
          cwd: compilation.projectDir,
          signal: compilation.options.signal,
          maxBuffer: 16 * 1024 * 1024,
        },
      );
      compilation.options.signal?.throwIfAborted();
      for (const page of projection.pages)
        await access(
          path.join(
            staging,
            outputFile(page.url, compilation.config.site.baseUrl),
          ),
        );
      await access(path.join(destination, "_doc-base/search.json"));
      for (const redirect of projection.redirects)
        await put(
          staging,
          outputFile(redirect.from, compilation.config.site.baseUrl),
          `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=${escape(redirect.to)}"><link rel="canonical" href="${escape(redirect.to)}"><meta name="robots" content="noindex"><title>Page moved</title></head><body><a href="${escape(redirect.to)}">Continue to the page</a></body></html>`,
        );
    }
    const hashes: Record<string, string> = {};
    const walk = async (directory: string): Promise<void> => {
      for (const entry of (
        await readdir(directory, { withFileTypes: true })
      ).sort((a, b) => (a.name < b.name ? -1 : 1))) {
        const file = path.join(directory, entry.name);
        if (entry.isDirectory()) await walk(file);
        else
          hashes[path.relative(staging, file).split(path.sep).join("/")] =
            fingerprint(await readFile(file));
      }
    };
    await walk(staging);
    const {
      createdAt: _createdAt,
      outputFingerprint: _fingerprint,
      ...semantic
    } = compilation.manifest;
    compilation.manifest.outputFingerprint = fingerprint(
      stableJson({ manifest: semantic, files: hashes }),
    );
    await put(
      staging,
      "_doc-base/build-manifest.json",
      stableJson(compilation.manifest),
    );
    await mkdir(path.dirname(output), { recursive: true });
    await promoteDirectory(staging, output, compilation.options.signal);
    return output;
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    if (error instanceof DocBaseError) throw error;
    throw new DocBaseError(1, [
      diagnostic(
        "DBV100",
        `Static build failed: ${error instanceof Error ? error.message : String(error)}`,
      ),
    ]);
  } finally {
    await rm(generated, { recursive: true, force: true });
  }
}
export async function devSite(
  compilation: Compilation,
): Promise<{ stop(): Promise<void>; markStale(message: string): void }> {
  const generated = await generate(compilation, { retainGeneration: true });
  await assertManifest(generated);
  const servers: Array<{ baseUrl: string; server: DevServer }> = [];
  try {
    for (const projection of compilation.projections) {
      const server = await dev({
        ...configFor(path.join(generated, projection.audience ?? "default")),
        server: { ...compilation.config.development, port: 0, open: false },
        vite: {
          server: {
            ws: {
              clientPort: compilation.config.development.port,
            },
          },
        },
      });
      servers.push({ baseUrl: projection.baseUrl, server });
    }
    servers.sort((a, b) => b.baseUrl.length - a.baseUrl.length);
    const generation = randomUUID();
    let status = { generation, stale: false, message: "" };
    const clients = new Set<ServerResponse>();
    const sendStatus = (response: ServerResponse) =>
      response.write("data: " + JSON.stringify(status) + "\n\n");
    const selectServer = (url: string) =>
      servers.find((item) => url.startsWith(item.baseUrl)) ??
      servers[servers.length - 1];
    const webSocketConnections = new Set<Duplex>();
    const router = createServer((request, response) => {
      if (
        servers.some(
          (item) =>
            request.url === item.baseUrl + "_doc-base/development-events",
        )
      ) {
        response.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        });
        clients.add(response);
        sendStatus(response);
        request.once("close", () => clients.delete(response));
        return;
      }
      selectServer(request.url ?? "/").server.handle(request, response);
    });
    router.on("upgrade", (request, socket, head) => {
      const { address } = selectServer(request.url ?? "/").server;
      const upstream = createConnection(address.port, address.address);
      webSocketConnections.add(socket);
      const close = () => {
        webSocketConnections.delete(socket);
        socket.destroy();
        upstream.destroy();
      };
      socket.once("error", close);
      socket.once("close", close);
      upstream.once("error", close);
      upstream.once("close", close);
      upstream.once("connect", () => {
        const headers = request.rawHeaders;
        let handshake = `${request.method} ${request.url} HTTP/${request.httpVersion}\r\n`;
        for (let index = 0; index < headers.length; index += 2)
          handshake += `${headers[index]}: ${headers[index + 1]}\r\n`;
        upstream.write(handshake + "\r\n");
        if (head.length) upstream.write(head);
        socket.pipe(upstream);
        upstream.pipe(socket);
      });
    });
    await new Promise<void>((resolve, reject) => {
      router.once("error", reject);
      router.listen(
        compilation.config.development.port,
        compilation.config.development.host,
        resolve,
      );
    });
    return {
      markStale(message) {
        status = { generation, stale: true, message };
        for (const client of clients) sendStatus(client);
      },
      async stop() {
        router.closeAllConnections();
        for (const socket of webSocketConnections) socket.destroy();
        await Promise.all([
          new Promise<void>((resolve, reject) =>
            router.close((error) => (error ? reject(error) : resolve())),
          ),
          ...servers.map((item) => item.server.stop()),
        ]);
        await rm(generated, { recursive: true, force: true });
      },
    };
  } catch (error) {
    await Promise.all(servers.map((item) => item.server.stop()));
    await rm(generated, { recursive: true, force: true });
    throw error;
  }
}
