import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import {
  loadPostRoutes,
  loadPostSlugs,
  postPath,
} from "../scripts/post-pages.js";
import {
  createPostRoutes,
  postPath as sharedPostPath,
  slugify,
} from "../public/scripts/post-routes.js";
import { JSDOM } from "jsdom";
import { marked } from "marked";
import createDOMPurify from "dompurify";
import { server } from "../server.js";

const shell = await readFile("dist/blog/index.html", "utf8");
const source = (await readFile("public/scripts/blog.js", "utf8"))
  .replace(/^import .*;\n/gm, "")
  .replace("export async function render", "async function render");
async function render(url, responses) {
  const dom = new JSDOM(shell, { url });
  const calls = [];
  const request = async (url, options) => {
    assert.equal(options.credentials, "omit");
    calls.push(url);
    const resolved = new URL(url, dom.window.location.href);
    assert.equal(resolved.origin, dom.window.location.origin);
    assert.equal(resolved.pathname, "/data/local-posts.json");
    const value = responses[resolved.pathname];
    return {
      ok: !!value && !value.status,
      status: value?.status || 200,
      json: async () => value,
    };
  };
  const execute = new (Object.getPrototypeOf(async function () {}).constructor)(
    "document",
    "location",
    "fetch",
    "marked",
    "DOMPurify",
    "updateDiscordTimestamps",
    "console",
    "createPostRoutes",
    "postPath",
    "history",
    source,
  );
  await execute(
    dom.window.document,
    dom.window.location,
    request,
    marked,
    createDOMPurify(dom.window),
    () => {},
    { error() {} },
    createPostRoutes,
    sharedPostPath,
    dom.window.history,
  );
  for (const url of calls) {
    const resolved = new URL(url, dom.window.location.href);
    assert.equal(resolved.origin, dom.window.location.origin);
    assert.equal(resolved.pathname, "/data/local-posts.json");
  }
  return { document: dom.window.document, calls };
}
test("local posts render newest first with undated posts last", async () => {
  const local = {
    posts: [
      {
        slug: "old",
        title: "Old",
        categories: ["Apps"],
        markdown: "Released on <t:100:F>",
      },
      {
        slug: "undated",
        title: "Undated",
        categories: ["Apps"],
        markdown: "No publication date",
      },
      {
        slug: "new",
        title: "New",
        categories: ["Apps"],
        markdown: "Released on <t:300:F>",
      },
      {
        slug: "middle",
        title: "Middle",
        categories: ["Apps"],
        publishedAt: 200,
        markdown: "",
      },
    ],
  };
  for (const suffix of ["", "?category=Apps"]) {
    const { document } = await render(
      `https://local-blog.example/blog/${suffix}`,
      {
        "/data/local-posts.json": local,
      },
    );
    assert.deepEqual(
      [...document.querySelectorAll("#blog-content li > a")].map(
        (a) => a.textContent,
      ),
      ["New", "Middle", "Old", "Undated"],
    );
  }
});

const posts = {
  posts: [
    {
      slug: "test",
      title: "<img src=x onerror=alert(1)>",
      categories: ["A", "B", "C"],
    },
  ],
};
test("build slug discovery reads local Markdown files", async () => {
  const { mkdtemp, writeFile, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const path = await import("node:path");
  const root = await mkdtemp(path.join(tmpdir(), "md-blog-routes-"));
  try {
    assert.deepEqual(await loadPostSlugs(root), []);
    await writeFile(
      path.join(root, "xmrigui.md"),
      "# XMRiGUI Update V2.0.0\nContent",
    );
    assert.deepEqual(await loadPostSlugs(root), ["xmrigui"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("local Markdown renders filtered lists, title routes and slug aliases", async () => {
  const local = {
    posts: [
      {
        slug: "offline",
        title: "Offline post",
        categories: ["Apps"],
        markdown: "# Offline post\n**Local content**",
      },
    ],
  };
  const responses = { "/data/local-posts.json": local };
  const list = await render(
    "https://local-blog.example/blog/?category=Apps",
    responses,
  );
  assert.equal(list.document.querySelector("li a").textContent, "Offline post");
  assert.ok(list.document.querySelector(".category-tag.active"));
  for (const path of ["/blog/offline-post/", "/blog/offline/"]) {
    const post = await render(`https://local-blog.example${path}`, responses);
    assert.equal(post.document.title, "Offline post");
    assert.equal(
      post.document.querySelector("#blog-content strong").textContent,
      "Local content",
    );
    assert.equal(
      post.calls.filter((url) => url === "/data/local-posts.json").length,
      1,
    );
  }
});

test("local Markdown discovery includes nested files and category metadata", async () => {
  const { loadLocalPosts } = await import("../scripts/local-posts.js");
  const { mkdtemp, mkdir, writeFile, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const path = await import("node:path");
  const root = await mkdtemp(path.join(tmpdir(), "md-blog-"));
  try {
    await mkdir(path.join(root, "nested"));
    await writeFile(
      path.join(root, "nested", "example.md"),
      "# Example\n## **Categories: Apps, Android**\n**Bold**",
    );
    const posts = await loadLocalPosts(root);
    assert.equal(posts[0].slug, "example");
    assert.equal(posts[0].title, "Example");
    assert.deepEqual(posts[0].categories, ["Apps", "Android"]);
    assert.match(posts[0].markdown, /\*\*Bold\*\*/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("list uses safe metadata, encoded slugs and comma/ampersand title", async () => {
  const unsafeCategory = '<img src=x onerror="evil()">';
  const local = {
    posts: [
      { ...posts.posts[0], categories: ["A", "B", "C", unsafeCategory] },
      { slug: "excluded", title: "Excluded", categories: ["A"] },
    ],
  };
  const { document: d } = await render(
    "https://local-blog.example/blog/?category=A,B,C",
    { "/data/local-posts.json": local },
  );
  assert.equal(d.title, "My Blogs: A, B & C");
  assert.equal(
    d.querySelector('link[rel="canonical"]').href,
    "https://local-blog.example/blog/",
  );
  assert.equal(d.querySelector("li a").textContent, posts.posts[0].title);
  assert.equal(d.querySelectorAll("#blog-content li").length, 1);
  const category = [...d.querySelectorAll(".category-tag")].find(
    (node) => node.textContent === unsafeCategory,
  );
  assert.ok(category);
  assert.equal(
    new URL(category.href).searchParams.get("category"),
    `A,B,C,${unsafeCategory}`,
  );
  assert.equal(d.querySelectorAll(".category-tag.active").length, 3);
  assert.equal(
    d.querySelector("li a").getAttribute("href"),
    sharedPostPath(slugify(posts.posts[0].title)),
  );
  assert.equal(
    d.querySelector(
      '#blog-content img, #blog-content script, #blog-content [onerror], #blog-content a[href^="javascript:"]',
    ),
    null,
  );
  assert.equal(
    d.querySelector(".navigate-btn").href,
    "https://local-blog.example/blog/",
  );
});
test("legacy and canonical post links render sanitized Markdown with timestamps", async () => {
  for (const path of [
    "/api/blog/test",
    "/blog/test",
    "/blog/test/",
    "/blog/?post=test",
  ]) {
    const { document: d } = await render(`https://local-blog.example${path}`, {
      "/data/local-posts.json": {
        posts: [
          {
            slug: "test",
            title: "<b>Title</b>",
            categories: ["<img src=x>"],
            markdown:
              '# Heading\nCategories: hidden\n**bold** <t:1788258000:R>\n<script>alert(1)</script><img src=x onerror="evil()">\n[bad](javascript:alert)\n',
          },
        ],
      },
    });
    assert.equal(d.title, "<b>Title</b>");
    assert.equal(
      d.querySelector('link[rel="canonical"]').href,
      "https://local-blog.example/blog/b-title-b/",
    );
    assert.equal(
      d.querySelector(".navigate-btn").href,
      "https://local-blog.example/blog/",
    );
    assert.equal(d.querySelector("#blog-content h1"), null);
    assert.ok(d.querySelector("#blog-content strong"));
    assert.ok(d.querySelector('time[data-style="R"]'));
    assert.equal(
      d.querySelector(
        '#blog-content script, [onerror], a[href^="javascript:"]',
      ),
      null,
    );
  }
});
test("a local post renders without a generated page and gets a title canonical", async () => {
  const { document: d, calls } = await render(
    "https://local-blog.example/blog/not-built-yet/",
    {
      "/data/local-posts.json": {
        posts: [
          {
            slug: "not-built-yet",
            title: "Fresh post",
            markdown: "**New content**",
            categories: [],
          },
        ],
      },
    },
  );
  assert.equal(d.title, "Fresh post");
  assert.equal(
    d.querySelector("#blog-content strong").textContent,
    "New content",
  );
  assert.equal(
    d.querySelector('link[rel="canonical"]').href,
    "https://local-blog.example/blog/fresh-post/",
  );
  assert.deepEqual(calls, ["/data/local-posts.json"]);
  assert.ok(calls.includes("/data/local-posts.json"));
});
test("malformed local data fails closed without a network fallback", async () => {
  for (const data of [
    {},
    { posts: null },
    { posts: [null] },
    {
      posts: [{ slug: "../escape", title: "Unsafe" }],
    },
  ]) {
    const { document, calls } = await render("http://localhost:4321/blog/", {
      "/data/local-posts.json": data,
    });
    assert.equal(document.title, "Blog unavailable");
    assert.deepEqual(calls, ["/data/local-posts.json"]);
  }
});

test("empty filters, unavailable local data, missing post and unknown routes", async () => {
  const empty = await render(
    "https://local-blog.example/blog?category=missing",
    { "/data/local-posts.json": posts },
  );
  assert.match(
    empty.document.querySelector("#blog-content").textContent,
    /No posts found/,
  );
  const missing = await render("https://local-blog.example/api/blog/missing", {
    "/data/local-posts.json": posts,
  });
  assert.equal(missing.document.title, "Post not found");
  const unavailable = await render("https://local-blog.example/blog/", {});
  assert.equal(unavailable.document.title, "Blog unavailable");
  const unknown = await render("https://local-blog.example/unknown", {});
  assert.equal(unknown.document.title, "Page not found");
  assert.equal(unknown.calls.length, 0);
});
test("static artifact and preview HTTP routing", async () => {
  const readOptional = async (path) => {
    try {
      return await readFile(path, "utf8");
    } catch (error) {
      if (error.code === "ENOENT") return null;
      throw error;
    }
  };
  const configuredDomain = await readOptional("CNAME");
  assert.equal(await readOptional("dist/CNAME"), configuredDomain);
  const home = await readFile("dist/index.html", "utf8");
  assert.match(home, /About Me/);
  assert.match(home, /data-style="R"/);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const origin = `http://127.0.0.1:${server.address().port}`;
    for (const path of [
      "/",
      "/blog",
      "/blog/?post=test",
      "/vendor/marked.js",
      "/vendor/dompurify.js",
      "/styles/style.css",
      "/data/local-posts.json",
    ])
      assert.equal((await fetch(origin + path)).status, 200, path);
    const postRoutes = await loadPostRoutes();
    for (const entry of await readdir("dist/blog", { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const route = postPath(entry.name);
      const post = postRoutes.find(
        (post) => post.slug === entry.name || post.route === entry.name,
      );
      assert.ok(post, `Generated directory has a local post: ${entry.name}`);
      const canonicalPath = postPath(post.route);
      const page = await fetch(origin + route);
      assert.equal(page.status, 200, route);
      const html = new JSDOM(await page.text(), { url: origin + route });
      const artifact = new JSDOM(
        await readFile(`dist/blog/${entry.name}/index.html`, "utf8"),
      );
      for (const document of [html.window.document, artifact.window.document]) {
        assert.equal(
          document.querySelector('link[rel="canonical"]').getAttribute("href"),
          canonicalPath,
        );
      }
      assert.equal(
        html.window.document.querySelector('link[rel="canonical"]').href,
        origin + canonicalPath,
      );
      artifact.window.close();
      assert.equal((await fetch(origin + route.slice(0, -1))).status, 200);
      html.window.close();
    }
    const fresh = await fetch(origin + "/blog/not-built-yet/");
    assert.equal(fresh.status, 404);
    assert.match(await fresh.text(), /scripts\/blog.js/);
    const legacy = await fetch(origin + "/api/blog/test");
    assert.equal(legacy.status, 404);
    assert.match(await legacy.text(), /scripts\/blog.js/);
    assert.equal((await fetch(origin, { method: "POST" })).status, 405);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("theme persistence and all timestamp styles including invalid dates", async () => {
  const dom = new JSDOM(shell, {
    url: "https://local-blog.example",
    runScripts: "outside-only",
  });
  const { window } = dom;
  window.localStorage.setItem("theme", "dark");
  for (const style of ["t", "T", "d", "D", "f", "F", "R"]) {
    const time = window.document.createElement("time");
    time.className = "discord-timestamp";
    time.dataset.timestamp = "1788258000";
    time.dataset.style = style;
    window.document.body.append(time);
  }
  const invalid = window.document.createElement("time");
  invalid.className = "discord-timestamp";
  invalid.dataset.timestamp = "999999999999999999999999";
  window.document.body.append(invalid);
  window.setInterval = () => 0;
  window.eval(
    (await readFile("public/scripts/theme.js", "utf8")).replace(
      "export function",
      "function",
    ),
  );
  assert.ok(window.document.body.classList.contains("dark-mode"));
  for (const time of window.document.querySelectorAll("time[data-style]")) {
    assert.ok(time.textContent);
    assert.match(time.dateTime, /^2026-/);
  }
  window.document.querySelector(".theme-toggle").click();
  assert.equal(window.localStorage.getItem("theme"), "light");
  assert.equal(
    window.document.querySelector(".theme-toggle").getAttribute("aria-pressed"),
    "false",
  );
  window.close();
});

test("title routes normalize versions and reject ambiguous or unsafe paths", () => {
  assert.equal(slugify("XMRiGUI Update V2.0.0"), "xmrigui-update-v2-0-0");
  assert.equal(slugify("Änderung: V2.10.3!"), "anderung-v2-10-3");
  const route = createPostRoutes([
    { slug: "xmrigui", title: "XMRiGUI Update V2.0.0" },
  ])[0];
  assert.equal(postPath(route.route), "/blog/xmrigui-update-v2-0-0/");
  for (const entries of [
    [
      { slug: "one", title: "Same!" },
      { slug: "two", title: "Same?" },
    ],
    [
      { slug: "one", title: "two" },
      { slug: "two", title: "Other" },
    ],
    [{ slug: "../escape", title: "Safe title" }],
    [{ slug: "CON", title: "Safe title" }],
    [{ slug: "safe", title: "..." }],
  ])
    assert.throws(() => createPostRoutes(entries));
});

test("title URL resolves local slug and legacy URLs replace address and canonical", async () => {
  const title = "XMRiGUI Update V2.0.0";
  for (const path of [
    "/blog/xmrigui-update-v2-0-0/",
    "/blog/xmrigui/",
    "/blog/?post=xmrigui",
    "/api/blog/xmrigui",
  ]) {
    const { document: d, calls } = await render(
      `https://local-blog.example${path}`,
      {
        "/data/local-posts.json": {
          posts: [
            { slug: "xmrigui", title, markdown: "Update", categories: [] },
          ],
        },
      },
    );
    assert.equal(d.title, title);
    assert.equal(new URL(d.URL).pathname, "/blog/xmrigui-update-v2-0-0/");
    assert.equal(new URL(d.URL).search, "");
    assert.equal(
      d.querySelector("link[rel=canonical]").href,
      "https://local-blog.example/blog/xmrigui-update-v2-0-0/",
    );
    assert.deepEqual(calls, ["/data/local-posts.json"]);
  }
});
