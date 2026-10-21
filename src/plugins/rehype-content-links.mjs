import { fromHtml } from "hast-util-from-html";
import { classifyContentLink } from "../utils/content-links.ts";

function relTokens(value) {
	if (Array.isArray(value))
		return value.flatMap((token) => String(token).split(/\s+/));
	return typeof value === "string" ? value.split(/\s+/) : [];
}

function hasProperty(properties, camelCase, htmlName) {
	return camelCase in properties || htmlName in properties;
}

/**
 * 判断一个外链是否命中「联盟域名」白名单。
 *
 * ⚠️ 这里是**唯一**给链接加 `sponsored` 的地方，且必须按域名精确匹配：
 * - 只有联盟链接才配 `sponsored`（Google 要求付费/联盟链接声明付费关系）。
 * - 普通外链（比如 CPSC、AAP 这类引用来源）**绝不能**加 `sponsored`，
 *   否则等于向 Google 谎报付费关系。所以不能用"所有外链"这种粗口径。
 * - 站内链接完全不走这条分支（kind !== "external" 已提前 return）。
 *
 * 匹配规则：域名相等，或为其子域（www.amazon.com 命中 amazon.com）。
 * 不使用 includes/后缀模糊匹配，避免 `notamazon.com` 这类伪装域名误命中。
 */
function isAffiliateHref(href, affiliateDomains) {
	if (!affiliateDomains || affiliateDomains.length === 0) return false;
	let host;
	try {
		host = new URL(href).hostname.toLowerCase();
	} catch {
		return false;
	}
	return affiliateDomains.some((raw) => {
		const domain = String(raw).toLowerCase().trim();
		return host === domain || host.endsWith(`.${domain}`);
	});
}

function transformAnchor(node, options) {
	node.properties ??= {};
	const properties = node.properties;
	const href = properties.href;
	if (typeof href !== "string") return;

	const kind = classifyContentLink(href, {
		siteUrl: options.siteUrl,
		base: options.base,
		internalOrigins: options.internalOrigins,
		download: hasProperty(properties, "download", "download"),
	});
	properties.dataContentLinkKind = kind;

	if (
		kind !== "external" ||
		hasProperty(properties, "dataNoExternal", "data-no-external")
	) {
		return;
	}

	if (options.target && properties.target === undefined) {
		properties.target = options.target;
	}
	const mergedRel = new Set([...relTokens(properties.rel), ...options.rel]);
	// 联盟域名额外补 `sponsored`（付费关系声明），普通外链不补。
	if (isAffiliateHref(href, options.affiliateDomains)) {
		mergedRel.add("sponsored");
	}
	if (mergedRel.size > 0) properties.rel = [...mergedRel];
}

function transformChildren(parent, options) {
	const nextChildren = [];
	for (const child of parent.children ?? []) {
		if (child.type === "raw" && /<a\b/i.test(child.value ?? "")) {
			const fragment = fromHtml(child.value, { fragment: true });
			transformChildren(fragment, options);
			nextChildren.push(...fragment.children);
			continue;
		}
		if (child.type === "element") {
			if (child.tagName === "a") transformAnchor(child, options);
			transformChildren(child, options);
		}
		nextChildren.push(child);
	}
	parent.children = nextChildren;
}

/** Apply the shared content-link classification to final Markdown/MDX HAST. */
export function rehypeContentLinks(options = {}) {
	if (!options.siteUrl) {
		throw new Error("rehypeContentLinks requires siteUrl");
	}
	const normalizedOptions = {
		siteUrl: options.siteUrl,
		base: options.base ?? options.siteUrl,
		internalOrigins: options.internalOrigins ?? [],
		target: options.target ?? "_blank",
		rel: options.rel ?? ["nofollow", "noopener", "noreferrer"],
		affiliateDomains: options.affiliateDomains ?? [],
	};

	return (tree) => {
		transformChildren(tree, normalizedOptions);
	};
}
