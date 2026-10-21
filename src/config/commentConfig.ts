import rawComment from "../data/comment.json";
import type { CommentConfig } from "../types/config";
import { asRecord, bool, oneOf, str } from "../utils/cms-value";
import { SITE_LANG } from "./siteConfig";

/**
 * 评论系统配置由后台（Sveltia CMS）写进 `src/data/comment.json`。
 *
 * 后端选了 twikoo / giscus，但对应参数没填全时，直接在构建期关掉评论并告警 ——
 * 半配置状态下渲染出来的评论框只会白屏报错，比不显示更糟。
 */
const comment = asRecord(rawComment);

function readTwikoo(): NonNullable<CommentConfig["twikoo"]> {
	const raw = asRecord(comment?.twikoo);
	return {
		envId: str(raw?.envId, ""),
		lang: str(raw?.lang, SITE_LANG),
	};
}

function readGiscus(): NonNullable<CommentConfig["giscus"]> {
	const raw = asRecord(comment?.giscus);
	return {
		repo: str(raw?.repo, ""),
		repoId: str(raw?.repoId, ""),
		category: str(raw?.category, "Announcements"),
		categoryId: str(raw?.categoryId, ""),
		mapping: str(raw?.mapping, "pathname"),
		strict: str(raw?.strict, "0"),
		reactionsEnabled: str(raw?.reactionsEnabled, "1"),
		emitMetadata: str(raw?.emitMetadata, "0"),
		inputPosition: str(raw?.inputPosition, "top"),
		theme: str(raw?.theme, "preferred_color_scheme"),
		lang: str(raw?.lang, SITE_LANG),
		loading: str(raw?.loading, "lazy"),
	};
}

const twikoo = readTwikoo();
const giscus = readGiscus();

/** 主题按 `system` 字段决定渲染哪个组件，所以这里必须收敛到已配置好的那一个 */
const requestedSystem = oneOf(
	comment?.system,
	["twikoo", "giscus"] as const,
	"twikoo",
);

const twikooReady = twikoo.envId.trim() !== "";
const giscusReady = giscus.repo.trim() !== "" && giscus.repoId.trim() !== "";
const system = requestedSystem === "giscus" ? "giscus" : "twikoo";
const systemReady = system === "giscus" ? giscusReady : twikooReady;

const requestedEnable = bool(comment?.enable, false);

if (requestedEnable && !systemReady) {
	console.warn(
		`[comment] 后台已开启评论，但 ${system} 的必填参数没填全，已自动关闭评论组件。` +
			`请到后台「站点设置 → 评论系统」补齐 ${system === "giscus" ? "repo / repoId" : "envId"}。`,
	);
}

export const commentConfig: CommentConfig = {
	enable: requestedEnable && systemReady,
	system,
	twikoo,
	giscus,
};
