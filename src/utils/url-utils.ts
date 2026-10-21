import type { CollectionEntry } from "astro:content";
import I18nKey from "@i18n/i18nKey";
import { i18n } from "@i18n/translation";

import { permalinkConfig } from "../config";
import { generatePermalinkSlug } from "./permalink-utils";
import { slugifyTaxonomy } from "./taxonomy-utils";

/**
 * 移除文件扩展名（.md, .mdx, .markdown）
 * 用于将 Astro v5 Content Layer API 的 id 转换为 URL 友好的 slug
 */
export function removeFileExtension(id: string): string {
	return id.replace(/\.(md|mdx|markdown)$/i, "");
}

export function pathsEqual(path1: string, path2: string) {
	const normalizedPath1 = path1.replace(/^\/|\/$/g, "").toLowerCase();
	const normalizedPath2 = path2.replace(/^\/|\/$/g, "").toLowerCase();
	return normalizedPath1 === normalizedPath2;
}

function joinUrl(...parts: string[]): string {
	const joined = parts.join("/");
	return joined.replace(/\/+/g, "/");
}

/**
 * ⚠️ 本站的文章前缀是 `/post/`（单数），**不是** Mizuki 默认的 `/posts/`（复数）。
 *
 * 原因：本站由 flare-stack-blog 迁移而来，线上 95 篇文章的历史 URL 全部是
 * `/post/<slug>`（无尾斜杠），且**正文里的 95 组内链也全部写成了这个形式**。
 * 改成 `/posts/` 会让 95 条文章链接 + 全部内链同时失效。
 *
 * 两个细节都实测过，不是照抄默认值：
 * - **单数**：`curl -I https://supplytoy.com/posts` → 307 跳到 `/posts`（复数只是个重定向壳）。
 * - **不带尾斜杠**：`curl -I .../post/<slug>` → 200；`.../post/<slug>/` → 307 跳回无斜杠版本。
 *   所以这里**绝不能**拼结尾的 `/`，否则每个内链都要多一跳 307。
 */
export function getPostUrlBySlug(slug: string): string {
	// 移除文件扩展名（如 .md, .mdx 等）
	const slugWithoutExt = removeFileExtension(slug);
	return url(`/post/${slugWithoutExt}`);
}

export function getPostUrlByAlias(alias: string): string {
	// 移除开头的斜杠并确保固定链接在 /post/ 路径下
	const cleanAlias = alias.replace(/^\/+/, "");
	return url(`/post/${cleanAlias}`);
}

export function getPostUrl(post: CollectionEntry<"posts">): string;
export function getPostUrl(post: {
	id: string;
	data: { alias?: string; permalink?: string };
}): string;
// biome-ignore lint/suspicious/noExplicitAny: overload union
export function getPostUrl(post: any): string {
	// 如果文章有自定义 permalink，优先使用（在根目录下）
	if (post.data.permalink) {
		const slug = post.data.permalink.replace(/^\/+/, "").replace(/\/+$/, "");
		return url(`/${slug}`);
	}

	// 如果全局 permalink 功能启用，使用生成的 slug（在根目录下）
	if (permalinkConfig.enable) {
		const slug = generatePermalinkSlug(post);
		return url(`/${slug}`);
	}

	// 如果文章有 alias，使用 alias（在 /posts/ 下）
	if (post.data.alias) {
		return getPostUrlByAlias(post.data.alias);
	}

	// 否则使用默认的 slug 路径
	return getPostUrlBySlug(post.id);
}

/**
 * 🔴 主题原版把标签/分类链接都指向 `/archive/?tag=X` 与 `/archive/?category=X`
 * （Mizuki 是个人博客，归档页同时充当筛选页）。
 *
 * 但本站在线实测：archive 页是 404，且本站的真实分类/标签页是
 * `/category/<slug>` 与 `/tag/<slug>`（由 src/pages/category/[category].astro
 * 与 src/pages/tag/[tag].astro 产出，线上已在 sitemap 里）。
 *
 * 所以这里必须改成指向真实页面：
 *  - 不改的话，全站 422 个页面的标签/分类链接全部打到 404；
 *  - 同时 /tag/* 与 /category/* 会变成**零入度的孤儿页**（sitemap 里有、页面里没人链）。
 *
 * slug 规则必须与 taxonomy-utils.slugifyTaxonomy() 完全一致，
 * 否则链接会指向不存在的 slug（多篇标签 noindex 判定也会跟着错）。
 */
export function getTagUrl(tag: string): string {
	const name = (tag ?? "").trim();
	if (!name) {
		return url("/tags");
	}
	return url(`/tag/${slugifyTaxonomy(name)}`);
}

export function getCategoryUrl(category: string | null): string {
	const name = (category ?? "").trim();
	if (
		!name ||
		name.toLowerCase() === i18n(I18nKey.uncategorized).toLowerCase()
	) {
		return url("/categories");
	}
	return url(`/category/${slugifyTaxonomy(name)}`);
}

export function getDir(path: string): string {
	// 移除文件扩展名
	const pathWithoutExt = removeFileExtension(path);
	const lastSlashIndex = pathWithoutExt.lastIndexOf("/");
	if (lastSlashIndex < 0) {
		return "/";
	}
	return pathWithoutExt.substring(0, lastSlashIndex + 1);
}

export function getFileDirFromPath(filePath: string): string {
	return filePath.replace(/^src\//, "").replace(/\/[^/]+$/, "");
}

export function url(path: string) {
	return joinUrl("", import.meta.env.BASE_URL, path);
}
