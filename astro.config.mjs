import fs from "node:fs";
import path from "node:path";
import { unified } from "@astrojs/markdown-remark";
import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";
import svelte, { vitePreprocess } from "@astrojs/svelte";
import { pluginCollapsibleSections } from "@expressive-code/plugin-collapsible-sections";
import { pluginLineNumbers } from "@expressive-code/plugin-line-numbers";
import swup from "@swup/astro";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, fontProviders } from "astro/config";
import expressiveCode from "astro-expressive-code";
import icon from "astro-icon";
import { pluginLanguageLogo } from "ec-lang-logo";
import "katex/dist/contrib/mhchem.mjs";
import { oddmisc } from "oddmisc";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import rehypeCodeGroup from "rehype-code-group";
import rehypeComponents from "rehype-components";
import rehypeKatex from "rehype-katex";
import rehypeSlug from "rehype-slug";
import remarkDirective from "remark-directive";
import remarkMath from "remark-math";
import remarkSectionize from "remark-sectionize";

import {
	expressiveCodeConfig,
	markdownConfig,
	permalinkConfig,
	siteConfig,
} from "./src/config/index.ts";
import { stripHtmlComments } from "./src/integrations/strip-html-comments.mjs";
import { buildIconInclude } from "./src/plugins/astro-icon-include.mjs";
import { pluginCustomCopyButton } from "./src/plugins/expressive-code/custom-copy-button.js";
import { pluginLanguageBadge } from "./src/plugins/expressive-code/language-badge.ts";
import { AdmonitionComponent } from "./src/plugins/rehype-component-admonition.mjs";
import { GithubCardComponent } from "./src/plugins/rehype-component-github-card.mjs";
import { ImageGridComponent } from "./src/plugins/rehype-component-image-grid.mjs";
import { rehypeContentLinks } from "./src/plugins/rehype-content-links.mjs";
import { rehypeMarkdownImages } from "./src/plugins/rehype-markdown-images.mjs";
import { rehypeMermaid } from "./src/plugins/rehype-mermaid.mjs";
import { rehypePlantuml } from "./src/plugins/rehype-plantuml.mjs";
import { rehypeWrapTable } from "./src/plugins/rehype-wrap-table.mjs";
import { remarkAutoImageGrid } from "./src/plugins/remark-auto-image-grid.mjs";
import { remarkContent } from "./src/plugins/remark-content.mjs";
import { parseDirectiveNode } from "./src/plugins/remark-directive-rehype.js";
import { remarkEscapeNumericColons } from "./src/plugins/remark-escape-numeric-colons.mjs";
import { remarkFixGithubAdmonitions } from "./src/plugins/remark-fix-github-admonitions.js";
import { remarkMarkSectionized } from "./src/plugins/remark-mark-sectionized.mjs";
import { remarkMermaid } from "./src/plugins/remark-mermaid.js";
import { remarkPlantuml } from "./src/plugins/remark-plantuml.mjs";
import { remarkWikiLink } from "./src/plugins/remark-wiki-link.mjs";
import { resolveFontMode } from "./src/utils/fontMode.ts";

const customFontsEnabled = resolveFontMode(siteConfig) === "custom";

/**
 * 构建期算出「该进 sitemap 的标签 slug」集合（= 文章数 ≥2 的标签）。
 *
 * 为什么要在配置里手算一遍，而不是引用 `src/utils/taxonomy-utils.ts` 里的函数：
 * sitemap 的 `filter` 是**同步**的（`filter?(page: string): boolean`），
 * 而读取 content collection 是异步的；配置模块顶层直接扫 md 文件反而更简单可靠。
 * 判据必须与 `src/pages/tag/[tag].astro` 的 noindex 判据一致（同为「≥2 篇」），
 * 否则会出现「页面 noindex 却进了 sitemap」这种自相矛盾的状态。
 */
const SITEMAP_INDEXABLE_TAGS = (() => {
	const dir = path.join(import.meta.dirname, "src/content/posts");
	const counts = new Map();
	let files = [];
	try {
		files = fs.readdirSync(dir).filter((f) => f.endsWith(".md"));
	} catch {
		return new Set();
	}
	for (const f of files) {
		let txt = "";
		try {
			txt = fs.readFileSync(path.join(dir, f), "utf8");
		} catch {
			continue;
		}
		const fm = txt.match(/^---\r?\n([\s\S]*?)\r?\n---/);
		if (!fm) continue;
		const tm = fm[1].match(/^tags:\r?\n((?: {2}- .*\r?\n?)*)/m);
		if (!tm) continue;
		for (const line of tm[1].split(/\r?\n/)) {
			const mm = line.match(/^ {2}- (.*)$/);
			if (!mm) continue;
			const name = mm[1].trim().replace(/^["']|["']$/g, "");
			if (!name) continue;
			counts.set(name, (counts.get(name) || 0) + 1);
		}
	}
	const slugify = (n) =>
		n
			.trim()
			.toLowerCase()
			.replace(/\./g, "")
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-+|-+$/g, "");
	return new Set(
		[...counts.entries()].filter(([, c]) => c >= 2).map(([n]) => slugify(n)),
	);
})();

// https://astro.build/config
export default defineConfig({
	fonts: customFontsEnabled
		? [
				{
					// 代码等宽字体
					name: "JetBrains Mono",
					cssVariable: "--font-jetbrains-mono",
					provider: fontProviders.fontsource(),
					styles: ["normal", "italic"],
				},
				// ── 正文（拉丁字母 / 数字）：Inter ────────────────────────────
				// 许可：SIL Open Font License 1.1 —— 可商用、可修改、可嵌入、可再分发，
				//       无任何附加收费条款。许可证全文见 public/fonts/LICENSE.txt
				// 来源：https://fontsource.org/fonts/inter
				{
					name: "Inter",
					cssVariable: "--font-body",
					provider: fontProviders.fontsource(),
					weights: [400, 500, 600, 700],
					styles: ["normal"],
					subsets: ["latin", "latin-ext", "greek"],
					// These variables are composed into --font-sans below. Keep their
					// fallback lists empty; otherwise a system fallback after this Latin
					// font prevents the following CJK font from ever being considered.
					fallbacks: [],
					optimizedFallbacks: false,
				},
				// ── 中文：Noto Sans SC（思源黑体）────────────────────────────
				// 许可：SIL Open Font License 1.1 —— 可商用、可修改、可嵌入、可再分发，
				//       无任何附加收费条款。许可证全文见 public/fonts/LICENSE.txt
				// 来源：https://fontsource.org/fonts/noto-sans-sc
				// chinese-simplified 子集收录 7946 个码位，实测覆盖本站全部文章正文
				// 汉字 99.94%（仅 1 个生僻字不在集内，会自动回落到系统黑体）。
				{
					name: "Noto Sans SC",
					cssVariable: "--font-cjk",
					provider: fontProviders.fontsource(),
					weights: [400, 500, 700],
					styles: ["normal"],
					subsets: ["chinese-simplified"],
					// The final system fallback belongs to --font-sans, not this partial
					// CJK font stack.
					fallbacks: [],
					optimizedFallbacks: false,
				},
			]
		: [],

	site: siteConfig.siteURL,
	base: "/",
	// ⚠️ 必须是 "never"（Mizuki 默认是 "always"）。
	// 本站的历史 URL 是 `/post/<slug>`（无尾斜杠），线上实测：
	//   无斜杠 → 200，带斜杠 → 307 跳回无斜杠版本。
	// 若沿用 "always"，所有文章 URL 会集体反向跳一次，与站内 95 组内链、
	// sitemap、以及外部已有链接全部冲突。
	trailingSlash: "never",
	// 输出 /post/<slug>.html，配合 Workers 的 html_handling 让无扩展名 URL 直接命中
	build: {
		format: "file",
	},
	compressHTML: true,

	output: "static",

	image: {
		layout: "constrained",
	},

	server: {
		port: 3000,
	},

	integrations: [
		stripHtmlComments(),
		oddmisc({
			umami: {
				shareUrl: false,
			},
		}),
		swup({
			theme: false,
			animationClass: "transition-swup-",
			containers: ["main"],
			smoothScrolling: false, // 禁用平滑滚动以提升性能，避免与锚点导航冲突
			cache: true,
			preload: false, // 禁用预加载以提升性能
			accessibility: true,
			updateHead: process.env.NODE_ENV === "production",
			updateBodyClass: false,
			globalInstance: true,
			// 滚动相关配置优化
			resolveUrl: (url) => url,
			animateHistoryBrowsing: false,
			skipPopStateHandling: (event) => {
				// 跳过锚点链接的处理，让浏览器原生处理
				return event.state?.url?.includes("#");
			},
		}),
		icon({
			include: buildIconInclude(),
		}),
		expressiveCode({
			themes: [expressiveCodeConfig.lightTheme, expressiveCodeConfig.darkTheme],
			plugins: [
				pluginCollapsibleSections(),
				pluginLineNumbers(),
				...(expressiveCodeConfig.languageBadge.enable
					? [pluginLanguageBadge()]
					: []),
				...(expressiveCodeConfig.languageLogo.enable
					? [
							pluginLanguageLogo({
								color: expressiveCodeConfig.languageLogo.color ?? "mono",
								excludedLangs:
									expressiveCodeConfig.languageLogo.excludedLangs ?? [],
							}),
						]
					: []),
				pluginCustomCopyButton(),
			],
			defaultProps: {
				wrap: expressiveCodeConfig.defaultWrap,
				overridesByLang: {
					shellsession: { showLineNumbers: false },
					bash: { frame: "code" },
					shell: { frame: "code" },
					sh: { frame: "code" },
					zsh: { frame: "code" },
				},
			},
			styleOverrides: {
				codeBackground: "var(--codeblock-bg)",
				borderRadius: "0.75rem",
				borderColor: "none",
				codeFontSize: "0.875rem",
				codeFontFamily:
					"var(--font-jetbrains-mono, ui-monospace), SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
				codeLineHeight: "1.5rem",
				frames: {
					editorBackground: "var(--codeblock-bg)",
					terminalBackground: "var(--codeblock-bg)",
					terminalTitlebarBackground: "var(--codeblock-bg)",
					editorTabBarBackground: "var(--codeblock-bg)",
					editorActiveTabBackground: "none",
					editorActiveTabIndicatorBottomColor: "var(--primary)",
					editorActiveTabIndicatorTopColor: "none",
					editorTabBarBorderBottomColor: "var(--codeblock-bg)",
					terminalTitlebarBorderBottomColor: "none",
				},
				textMarkers: {
					delHue: 0,
					insHue: 180,
					markHue: 250,
				},
			},
			frames: {
				showCopyToClipboardButton: false,
			},
		}),
		svelte({
			preprocess: vitePreprocess(),
		}),
		sitemap({
			// 目标：与老站 sitemap 对齐（152 条 = 1 首页 + 95 文章 + 6 分类页
			// + 46 标签页(≥2 篇) + /posts + /categories + /tags + /friend-links）。
			//
			// ⚠️ 这里是**白名单式**判断，不是"排除几个"：Mizuki 原版会产出一堆
			// 本站用不到的东西（/about、/archive、/friends、/atom、/rss、分页），
			// 逐个排除容易漏；反过来只放行已知该收录的路径最不容易出错。
			filter: (page) => {
				const pathname = new URL(page).pathname;

				// 1) 首页
				if (pathname === "/") return true;
				// 2) 95 篇文章
				if (pathname.startsWith("/post/")) return true;
				// 3) 6 个分类页
				if (pathname.startsWith("/category/")) return true;
				// 4) 三个枢纽页 + Links
				if (
					pathname === "/posts" ||
					pathname === "/categories" ||
					pathname === "/tags" ||
					pathname === "/friend-links"
				) {
					return true;
				}
				// 5) 标签页：只有 ≥2 篇文章的才收录（46 个）。
				//    判据来自 SITEMAP_INDEXABLE_TAGS —— 由构建期扫描内容生成，
				//    与 tag/[tag].astro 里的 noindex 判据同源，避免两边打架。
				if (pathname.startsWith("/tag/")) {
					const slug = pathname.slice("/tag/".length).replace(/\/$/, "");
					return SITEMAP_INDEXABLE_TAGS.has(slug);
				}
				// 其余（/about、/archive、/friends、/atom、/rss、/posts/N 分页…）一律不收录
				return false;
			},
			serialize: (item) => {
				// 文章页 priority 高，枢纽页次之 —— 与老站结构对齐
				const pathname = new URL(item.url).pathname;
				if (pathname === "/") {
					return { ...item, changefreq: "daily", priority: 1.0 };
				}
				if (pathname.startsWith("/post/")) {
					return { ...item, changefreq: "weekly", priority: 0.8 };
				}
				return { ...item, changefreq: "weekly", priority: 0.6 };
			},
		}),
		mdx(),
	],
	markdown: {
		processor: unified({
			remarkPlugins: [
				remarkMath,
				remarkContent,
				remarkFixGithubAdmonitions,
				remarkDirective,
				remarkEscapeNumericColons,
				...(markdownConfig.wikiLink.enable
					? [
							[
								remarkWikiLink,
								{
									...markdownConfig.wikiLink,
									permalink: permalinkConfig,
									imageApi: siteConfig.banner.imageApi,
									noReferrerDomains:
										siteConfig.imageOptimization?.noReferrerDomains ?? [],
								},
							],
						]
					: []),
				...(markdownConfig.autoImageGrid.enable
					? [[remarkAutoImageGrid, markdownConfig.autoImageGrid]]
					: []),
				parseDirectiveNode,
				remarkMermaid,
				[remarkPlantuml, markdownConfig.plantuml],
				remarkSectionize,
				remarkMarkSectionized,
			],
			rehypePlugins: [
				rehypeKatex,
				[
					rehypeContentLinks,
					{
						siteUrl: siteConfig.siteURL,
						target: "_blank",
						rel: ["nofollow", "noopener", "noreferrer"],
						// 🔴 联盟域名白名单：命中的链接会额外获得 `sponsored`。
						// 线上老站（flare-stack-blog 渲染层）的亚马逊链接写法是
						// `rel="noopener noreferrer sponsored nofollow"`，迁移后必须保持一致，
						// 否则等于丢掉了付费关系声明（Google 对联盟链接的硬要求）。
						// 只列联盟域名 —— 引用来源（CPSC/AAP 等）绝不能加 sponsored。
						affiliateDomains: ["amazon.com"],
					},
				],
				rehypeSlug,
				...(expressiveCodeConfig.codeGroup.enable ? [rehypeCodeGroup] : []),
				rehypeWrapTable,
				rehypeMermaid,
				rehypePlantuml,
				[
					rehypeComponents,
					{
						components: {
							github: GithubCardComponent,
							grid: ImageGridComponent,
							note: (x, y) => AdmonitionComponent(x, y, "note"),
							tip: (x, y) => AdmonitionComponent(x, y, "tip"),
							important: (x, y) => AdmonitionComponent(x, y, "important"),
							caution: (x, y) => AdmonitionComponent(x, y, "caution"),
							warning: (x, y) => AdmonitionComponent(x, y, "warning"),
							info: (x, y) => AdmonitionComponent(x, y, "note"),
							abstract: (x, y) => AdmonitionComponent(x, y, "note"),
							summary: (x, y) => AdmonitionComponent(x, y, "note"),
							tldr: (x, y) => AdmonitionComponent(x, y, "note"),
							todo: (x, y) => AdmonitionComponent(x, y, "note"),
							hint: (x, y) => AdmonitionComponent(x, y, "tip"),
							success: (x, y) => AdmonitionComponent(x, y, "tip"),
							check: (x, y) => AdmonitionComponent(x, y, "tip"),
							done: (x, y) => AdmonitionComponent(x, y, "tip"),
							question: (x, y) => AdmonitionComponent(x, y, "important"),
							help: (x, y) => AdmonitionComponent(x, y, "important"),
							faq: (x, y) => AdmonitionComponent(x, y, "important"),
							attention: (x, y) => AdmonitionComponent(x, y, "warning"),
							failure: (x, y) => AdmonitionComponent(x, y, "caution"),
							fail: (x, y) => AdmonitionComponent(x, y, "caution"),
							missing: (x, y) => AdmonitionComponent(x, y, "caution"),
							danger: (x, y) => AdmonitionComponent(x, y, "caution"),
							error: (x, y) => AdmonitionComponent(x, y, "caution"),
							bug: (x, y) => AdmonitionComponent(x, y, "caution"),
							example: (x, y) => AdmonitionComponent(x, y, "note"),
							quote: (x, y) => AdmonitionComponent(x, y, "note"),
							cite: (x, y) => AdmonitionComponent(x, y, "note"),
						},
					},
				],
				[
					rehypeAutolinkHeadings,
					{
						behavior: "append",
						properties: {
							className: ["anchor"],
						},
						content: {
							type: "element",
							tagName: "span",
							properties: {
								className: ["anchor-icon"],
								"data-pagefind-ignore": true,
							},
							children: [{ type: "text", value: "#" }],
						},
					},
				],
				[
					rehypeMarkdownImages,
					{
						noReferrerDomains:
							siteConfig.imageOptimization?.noReferrerDomains ?? [],
					},
				],
			],
		}),
	},
	vite: {
		plugins: [tailwindcss()],
		// 开发环境预打包优化：将常用依赖提前编译，避免首次页面加载时 on-demand 编译导致 8s+ 的等待
		optimizeDeps: {
			include: [
				"@iconify/svelte",
				"svelte",
				"svelte/transition",
				"svelte/easing",
				"overlayscrollbars",
				"@fancyapps/ui",
				"marked",
				"sanitize-html",
				"qrcode",
			],
		},
		// 预热常用入口文件，让 Vite 在服务器启动后立即开始转换，而不是等到浏览器请求
		server: {
			warmup: {
				clientFiles: [
					"src/layouts/Layout.astro",
					"src/pages/index.astro",
					"src/components/widgets/music-player/MusicPlayer.svelte",
					"src/components/organisms/navigation/Search.svelte",
					"src/components/control/ThemeSwitch.svelte",
					"src/components/features/settings/DisplaySettings.svelte",
					"src/scripts/swup-manager.ts",
				],
			},
		},
		build: {
			// 静态资源处理优化，防止小图片转 base64 导致 HTML 体积过大
			assetsInlineLimit: 4096,
			// CSS 代码分割
			cssCodeSplit: true,
			cssMinify: "esbuild",
			// 内联小型 CSS 文件以减少网络请求
			inlineStylesheets: "auto",
			// 生产环境移除 console 和 debugger
			minify: "esbuild",
			rollupOptions: {
				onwarn(warning, warn) {
					if (
						warning.message.includes("is dynamically imported by") &&
						warning.message.includes("but also statically imported by")
					) {
						return;
					}
					warn(warning);
				},
			},
		},
		// 生产环境移除 console.log 和 debugger
		esbuildOptions: {
			drop:
				process.env.NODE_ENV === "production" ? ["console", "debugger"] : [],
		},
	},
});
