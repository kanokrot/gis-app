import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const feedUrl = 'https://medium.com/feed/@kanokrot.kim';
const outputPath = new URL('../src/app/data/articles.json', import.meta.url);

function decodeEntities(value) {
  return value
    .replace(/&#x([\da-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number.parseInt(code, 10)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

function tagValue(item, tag) {
  const escapedTag = tag.replace(':', '\\:');
  const match = item.match(new RegExp(`<${escapedTag}\\b[^>]*>([\\s\\S]*?)<\\/${escapedTag}>`, 'i'));
  if (!match) return '';
  return decodeEntities(match[1].replace(/^<!\[CDATA\[|\]\]>$/g, '').trim());
}

function plainText(html) {
  return decodeEntities(html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim());
}

export function parseItems(xml) {
  return [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)].map(([, item]) => {
    const title = plainText(tagValue(item, 'title'));
    const rawUrl = tagValue(item, 'link');
    const pubDate = tagValue(item, 'pubDate');
    const content = tagValue(item, 'content:encoded');
    const tags = [...item.matchAll(/<category\b[^>]*>([\s\S]*?)<\/category>/gi)]
      .map(([, value]) => plainText(decodeEntities(value.replace(/^<!\[CDATA\[|\]\]>$/g, '').trim())))
      .filter(Boolean);
    const imageMatch = content.match(/<img\b[^>]*\bsrc=["']([^"']+)["']/i);
    const url = new URL(rawUrl);
    url.search = '';

    return {
      title,
      url: url.toString(),
      date: new Date(pubDate).toISOString(),
      tags: [...new Set(tags)],
      summary: plainText(content).slice(0, 160).trim(),
      image: imageMatch ? decodeEntities(imageMatch[1]) : null,
    };
  }).filter(article => article.title && article.url && article.date);
}

export async function fetchAndWriteArticles() {
  try {
    const response = await fetch(feedUrl, {
      headers: { accept: 'application/rss+xml, application/xml, text/xml' },
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error(`RSS request returned HTTP ${response.status}`);

    const articles = parseItems(await response.text()).sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
    if (articles.length === 0) throw new Error('RSS feed contained no readable article items');

    await writeFile(outputPath, `${JSON.stringify(articles, null, 2)}\n`, 'utf8');
    console.log(`Fetched ${articles.length} Medium articles.`);
  } catch (error) {
    try {
      await readFile(outputPath, 'utf8');
      console.warn(`Warning: Medium RSS could not be refreshed; keeping existing articles.json. ${error.message}`);
    } catch {
      console.warn(`Warning: Medium RSS could not be fetched and no articles.json exists. ${error.message}`);
    }
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  await fetchAndWriteArticles();
}
