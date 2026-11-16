# MDXpress Blog

A static Markdown blog based on [MD-Blog](https://github.com/FreetimeMaker/MD-Blog). Posts and categories come exclusively from local files in `public/blogs`, including nested directories. Neither the build nor the browser uses an external blog API. Node.js 24 or newer is needed for builds and local previews, not for production hosting.

## Features

- Markdown rendered with Marked; post HTML sanitized with DOMPurify. Both libraries are bundled locally rather than loaded from a CDN.
- Title-based URLs, compatible filename-slug links and legacy query/API paths.
- Case-insensitive category AND filtering, newest-first publication order, and localized Discord timestamps, including relative times refreshed every 30 seconds.
- Persistent light/dark theme, responsive styles and updated icon navigation.
- Static output with a GitHub Pages workflow and automated rendering, routing and security tests.

## Local development

```sh
npm ci
npm run dev
```

Open `http://localhost:3000`. `npm start` does the same; `PORT` changes the preview port. The preview serves only `dist`. Restart after changing source files; there is no watcher.

```sh
npm run build
npm test
```

Build before running tests. The build recursively reads Markdown into `dist/data/local-posts.json`, renders the homepage and generates blog shells for title-based paths and filename aliases. It validates local routes before replacing the previous output. Duplicate filename slugs, ambiguous title paths and unsafe slugs fail the build. No network discovery or API credentials are needed. Installing npm dependencies still requires access to the package registry.

## Editing content

Create a `.md` file in `public/blogs` (or a subdirectory):

```markdown
# My First Post

## **Released on <t:1788258000:F> (<t:1788258000:R>)**

## **Categories: Releases, Apps**

This is my **post**.
```

The first H1 supplies the title, falling back to the filename. Categories are optional and comma-separated. A `Released on` timestamp supplies the publication date for sorting; undated posts follow dated ones. Rebuild and redeploy after editing or adding posts.

Edit `public/md/index.md` for the homepage, `public/views/home.html` for the shared shell, `public/styles/style.css` for styling and `public/scripts/` for browser behaviour. Homepage Markdown is trusted repository content rendered at build time. Post Markdown is sanitized in the browser; executable HTML, event handlers and unsafe links are removed.

## Routes

- `/`: pre-rendered homepage, readable without JavaScript.
- `/blog/`: post list; `?category=Releases,Apps` selects posts with both categories.
- `/blog/my-first-post/`: title-based post route.
- `/blog/<filename-slug>/`: compatible filename alias.
- `/blog/?post=<filename-slug>` and `/api/blog/<filename-slug>`: legacy links.

Titles are normalized into lowercase ASCII hyphenated paths, for example `XMRiGUI Update V2.0.0` becomes `/blog/xmrigui-update-v2-0-0/`. Renaming a title changes its title path; filename aliases remain compatible. Browser navigation and canonical URLs use the current site's origin, not the upstream domain.

Posts are rendered from the bundled local JSON using JavaScript. Generated blog pages contain shells and canonical metadata, not server-rendered post content. Unknown paths use `404.html` and display a not-found message. On GitHub Pages, legacy `/api/` fallback URLs retain HTTP 404 even if the browser displays a matching post.

## Deployment

`.github/workflows/pages.yml` builds, tests and deploys `dist` on pushes to `main` or manual dispatch. In repository **Settings → Pages → Build and deployment**, select **GitHub Actions**. For another static host, build with `npm run build` and publish `dist`; configure its 404 page as appropriate. The former Vercel serverless handlers and routing configuration are no longer used.

Assets use root-relative paths. Serve this site at a domain root; GitHub Pages project subpaths such as `/repository-name/` require base-path changes. No upstream custom domain is imposed. To use your own domain, add a root `CNAME` file and configure DNS/Pages separately; the build copies that file if present.

The existing Google Fonts stylesheet still makes external font requests. Blog data and bundled rendering libraries do not use an external API or CDN.

## License

Created by [Freetime Maker](https://github.com/FreetimeMaker). GPL-3.0-only; see [LICENSE.txt](LICENSE.txt). Marked and DOMPurify retain their upstream licenses in npm dependencies.
