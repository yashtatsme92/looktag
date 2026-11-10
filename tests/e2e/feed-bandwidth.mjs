/**
 * Homepage HTML must not preload the seed catalog.
 * Only the first one or two feed photos are eager; every other image is lazy.
 */
const base = (process.env.BASE_URL || "http://127.0.0.1:8080").replace(/\/$/, "");

function tags(html, name) {
  return html.match(new RegExp(`<${name}\\b[^>]*>`, "gi")) ?? [];
}

const response = await fetch(`${base}/`);
if (!response.ok) {
  console.error(`homepage ${response.status}`);
  process.exit(1);
}
const html = await response.text();
const preloads = tags(html, "link").filter((tag) => /rel="preload"/i.test(tag) && /as="image"/i.test(tag));
const images = tags(html, "img");
const eager = images.filter((tag) => !/loading="lazy"/i.test(tag));
const failures = [];
if (images.length < 10) failures.push(`expected a seeded feed, found ${images.length} images`);
if (preloads.length > 2) failures.push(`${preloads.length} image preloads:\n${preloads.join("\n")}`);
if (eager.length < 1 || eager.length > 2) failures.push(`${eager.length} eager images:\n${eager.join("\n")}`);
for (const tag of images) {
  if (!/decoding="async"/i.test(tag)) failures.push(`missing decoding=async ${tag}`);
  if (!/loading="lazy"/i.test(tag) && !/fetchpriority="high"/i.test(tag)) {
    failures.push(`eager image without fetchpriority=high ${tag}`);
  }
}
if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(`feed images: ${images.length}, eager ${eager.length}, preloads ${preloads.length}`);
