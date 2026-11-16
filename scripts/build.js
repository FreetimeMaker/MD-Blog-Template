import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { marked } from "marked";
import { postPath } from "./post-pages.js";
import { loadLocalPosts } from "./local-posts.js";
import { createPostRoutes } from "../public/scripts/post-routes.js";

export function timestamps(markdown) {
  return markdown.replace(
    /<t:(\d+)(?::([tTdDfFR]))?>/g,
    (_, stamp, style = "f") =>
      `<time class="discord-timestamp" data-timestamp="${stamp}" data-style="${style}"></time>`,
  );
}
const escape = (text) =>
  text.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
// Validate local content before replacing the previous build artifact.
const localPosts = await loadLocalPosts();
const routes = createPostRoutes(localPosts);
const pageRoutes = new Map();
for (const post of routes) {
  for (const slug of new Set([post.route, post.slug]))
    pageRoutes.set(slug, post);
}
await rm("dist", { recursive: true, force: true });
await mkdir("dist/blog", { recursive: true });
await mkdir("dist/data", { recursive: true });
await writeFile(
  "dist/data/local-posts.json",
  JSON.stringify({ posts: localPosts }),
);
for (const dir of ["styles", "favicons", "scripts"])
  await cp(`public/${dir}`, `dist/${dir}`, { recursive: true });
await mkdir("dist/vendor", { recursive: true });
await cp("node_modules/marked/lib/marked.esm.js", "dist/vendor/marked.js");
await cp(
  "node_modules/dompurify/dist/purify.es.mjs",
  "dist/vendor/dompurify.js",
);
const template = await readFile("public/views/home.html", "utf8");
const markdown = await readFile("public/md/index.md", "utf8");
const title = (markdown.match(/^# (.+)/) || [])[1] || "Homepage";
await writeFile(
  "dist/index.html",
  template
    .replaceAll("{{title}}", escape(title))
    .replace(
      "{{content}}",
      marked.parse(timestamps(markdown.replace(/^# .*\n?/gm, ""))),
    ),
);
const shell = template
  .replace(
    '<a class="navigate-btn" href="/blog">Blogs</a>',
    '<a class="navigate-btn" href="/">Back</a>',
  )
  .replaceAll("{{title}}", "My Blogs")
  .replace(
    "{{content}}",
    '<div id="blog-content" aria-live="polite"><p>Loading…</p></div><noscript>JavaScript is required to display local blog posts.</noscript>',
  )
  .replace(
    "</body>",
    '<script type="module" src="/scripts/blog.js"></script></body>',
  );
await writeFile("dist/blog/index.html", shell);
for (const [slug, post] of pageRoutes) {
  await mkdir(`dist/blog/${slug}`, { recursive: true });
  const canonical = postPath(post.route);
  await writeFile(
    `dist/blog/${slug}/index.html`,
    shell.replace(
      "</head>",
      `<link rel="canonical" href="${escape(canonical)}" /></head>`,
    ),
  );
}
console.log(
  `Generated ${routes.length} canonical blog post paths plus legacy aliases from local Markdown.`,
);
await writeFile("dist/404.html", shell);
// Only publish a custom domain when this repository explicitly configures one.
try {
  await cp("CNAME", "dist/CNAME");
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
await writeFile("dist/.nojekyll", "");
