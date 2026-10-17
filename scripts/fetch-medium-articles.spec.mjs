import assert from 'node:assert/strict';
import test from 'node:test';
import { parseItems } from './fetch-medium-articles.mjs';

test('parses a Medium RSS item and normalizes its fields', () => {
  const xml = `<rss><channel><item>
    <title><![CDATA[An example CTF write-up]]></title>
    <link>https://medium.com/@writer/example?source=rss-123</link>
    <pubDate>Sat, 18 Apr 2026 12:00:00 GMT</pubDate>
    <category><![CDATA[Network Security]]></category>
    <category>CTF</category>
    <content:encoded><![CDATA[<figure><img src="https://cdn.example.test/cover.png"></figure><p>A short &amp; useful summary.</p>]]></content:encoded>
  </item></channel></rss>`;

  assert.deepEqual(parseItems(xml), [{
    title: 'An example CTF write-up',
    url: 'https://medium.com/@writer/example',
    date: '2026-04-18T12:00:00.000Z',
    tags: ['Network Security', 'CTF'],
    summary: 'A short & useful summary.',
    image: 'https://cdn.example.test/cover.png',
  }]);
});
