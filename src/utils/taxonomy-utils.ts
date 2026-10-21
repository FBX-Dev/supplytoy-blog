/**
 * 枢纽页（分类 / 标签）共用的工具函数。
 *
 * 这里的 slug 规则**不是随手写的**：它必须与老站 flare-stack-blog 的派生规则一致，
 * 否则 46 个标签页 + 6 个分类页的 URL 会集体变化，等于丢掉已有的收录。
 * 已用线上 sitemap 的 46 个 tag slug 做过全量比对：0 缺失、0 多余。
 *
 * 规则：转小写 → 去掉点号（`16 CFR 1250.5` → `16-cfr-12505`）→ 非字母数字压成连字符。
 */
export function slugifyTaxonomy(name: string): string {
	return name
		.trim()
		.toLowerCase()
		.replace(/\./g, "")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

/**
 * 只有 1 篇文章的标签页**不进 sitemap 且 noindex, follow**。
 *
 * 原因：302 个标签里绝大多数只对应 1 篇，若全部收录会产出大量近乎空白的页面，
 * 稀释整站质量（老站就是这么做的：46 个 ≥2 篇的进 sitemap，其余不进）。
 * 页面本身仍然生成并可访问 —— 只是不请搜索引擎收录。
 */
export const MIN_TAG_POSTS_FOR_INDEX = 2;

/**
 * 标签页标题 / H1 用的显示名。
 *
 * 规则来自老站实测：**只把首字母大写，其余原样保留**。
 *   toy safety        → Toy safety
 *   toy safety labels → Toy safety labels
 *   water beads       → Water beads
 *   stem toys         → Stem toys
 *   AAP guidance      → AAP guidance   （首字母本就是大写，不动）
 *   CPSC / UL 2271    → 原样
 *   16 CFR 1250.5     → 原样           （首字符是数字，不动）
 *
 * ⚠️ 不要用 CSS 的 `text-transform: capitalize` 或 title-case 去凑：
 * capitalize 会把**每个词**首字母都大写（`Toy Safety Labels`），
 * 而老站是 `Toy safety labels`，两者不一致。
 * ⚠️ 也不要拿 `/tags` 总览页的写法当准：那个页面列的是**原始小写**标签名
 * （老站实测 `toy safety`），只有独立标签页才做首字母大写。
 */
export function displayTagName(name: string): string {
	const trimmed = name.trim();
	if (!trimmed) return trimmed;
	return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}
