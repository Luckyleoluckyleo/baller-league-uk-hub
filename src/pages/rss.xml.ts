import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';

export const prerender = true;

export const GET: APIRoute = async ({ site }) => {
  const articles = await getCollection('news');
  const baseUrl = site?.toString() || 'https://ballerleagueukhub.com';

  const sortedArticles = articles
    .sort((a, b) => b.data.date.getTime() - a.data.date.getTime());

  const items = sortedArticles.map(article => {
    const url = `${baseUrl}news/${article.slug}/`;
    const pubDate = article.data.date.toUTCString();
    const category = article.data.category || 'Uncategorised';
    const author = article.data.author || 'Baller League UK Hub';

    return `
    <item>
      <title><![CDATA[${article.data.title}]]></title>
      <link>${url}</link>
      <guid isPermaLink="true">${url}</guid>
      <description><![CDATA[${article.data.excerpt}]]></description>
      <pubDate>${pubDate}</pubDate>
      <category>${category}</category>
      <author>${author}</author>
    </item>`;
  }).join('');

  const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>Baller League UK Hub — News &amp; Match Reports</title>
    <link>${baseUrl}</link>
    <description>The latest Baller League UK match reports, previews, and news. Live table, player stats, team profiles, and Gamechanger analysis.</description>
    <language>en-gb</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="${baseUrl}rss.xml" rel="self" type="application/rss+xml"/>
    <image>
      <url>${baseUrl}og-default.png</url>
      <title>Baller League UK Hub</title>
      <link>${baseUrl}</link>
      <width>1200</width>
      <height>630</height>
    </image>
    ${items}
  </channel>
</rss>`;

  return new Response(rss, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
    },
  });
};
