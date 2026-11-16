import { createPostRoutes } from "../public/scripts/post-routes.js";
import { loadLocalPosts } from "./local-posts.js";
export { postPath } from "../public/scripts/post-routes.js";

export async function loadPostRoutes(root = "public/blogs") {
  return createPostRoutes(await loadLocalPosts(root));
}

export async function loadPostSlugs(root = "public/blogs") {
  return (await loadPostRoutes(root)).map((post) => post.slug);
}
