import type { APIRoute } from "astro";

/**
 * robots.txt —— 迁移自 flare-stack-blog 版本，**保留原有语义**。
 *
 * 线上实际响应由两部分拼成：
 *  1. Cloudflare 在边缘注入的「Content Signals / AI 训练爬虫」段（`BEGIN Cloudflare
 *     Managed content`），那部分由 CF 的 AI Crawl Control 管理，**不归本文件管**，
 *     也不该在这里硬编码一份 —— 否则 CF 改规则后两边会打架。
 *  2. 站点自己的规则，就是下面这段。
 *
 * 与旧站的差异只有一处：旧站是 Worker 路由，能读 `env.DOMAIN` 动态拼站点域名；
 * 静态站没有运行时 env，所以域名从 Astro 的 `SITE` 取（由 astro.config.mjs 的
 * `site` 决定，源头是 `src/data/site-info.json`）。
 */
const robotsTxt = `User-agent: *
Allow: /
Disallow: /admin
Disallow: /search
Disallow: /unsubscribe
Disallow: /login
Disallow: /register
Disallow: /forgot-password
Disallow: /verify-email
Disallow: /reset-link
Disallow: /profile
Disallow: /submit-friend-link
Sitemap: ${new URL("sitemap.xml", import.meta.env.SITE).href}
`.trim();

export const GET: APIRoute = () => {
	return new Response(robotsTxt, {
		headers: {
			"Content-Type": "text/plain; charset=utf-8",
		},
	});
};
