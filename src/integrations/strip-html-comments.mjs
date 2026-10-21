/**
 * 构建期剥离 HTML 注释。
 *
 * 为什么需要这一步（不是洁癖，是两个实际问题）：
 *
 * 1) **源码里的中文注释会原样发给访客。** Astro 模板中的 `<!-- ... -->`
 *    会被当作真实节点输出，不做任何剥离。本站是英文站，任何中文出现在
 *    渲染结果里都是不该发生的（此前实测 428 个页面里有 427 个带中文，
 *    来源全部是 `.astro` 里的 HTML 注释）。爬虫也会把注释当正文读。
 *
 * 2) **注释会撑大页面。** 全站 HTML 里有 11 万条注释（含 Astro/Svelte 生成
 *    的 island 边界标记与框架水合注释），对静态站纯属浪费带宽。
 *
 * 安全性：已实测确认**没有任何注释落在 `<script>` / `<style>` 块内部**，
 * 因此按"整段替换"处理不会破坏内联脚本。为稳妥起见仍加了保护：
 * 只在块外做剥离 —— 若某天有人在 `<script>` 里写 `<!--`（JS 里合法但罕见），
 * 本函数会跳过它。
 *
 * ⚠️ 条件注释（`<!--[if IE]>`）也已绝迹，不做保留。
 * ⚠️ `astro:build:done` 阶段文件已落盘，这里直接读写 dist。
 */
import fs from "node:fs";
import path from "node:path";

function stripCommentsInHtml(html) {
	// 先把 <script>/<style> 整段摘出来，避免误伤其内部内容
	const protectedBlocks = [];
	const masked = html.replace(
		/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi,
		(block) => {
			const token = `\u0000PROTECTED${protectedBlocks.length}\u0000`;
			protectedBlocks.push(block);
			return token;
		},
	);

	const stripped = masked.replace(/<!--[\s\S]*?-->/g, "");

	return stripped.replace(/\u0000PROTECTED(\d+)\u0000/g, (_m, i) => protectedBlocks[Number(i)]);
}

function walkHtml(dir, out = []) {
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const p = path.join(dir, entry.name);
		if (entry.isDirectory()) walkHtml(p, out);
		else if (entry.name.endsWith(".html")) out.push(p);
	}
	return out;
}

export function stripHtmlComments() {
	return {
		name: "strip-html-comments",
		hooks: {
			"astro:build:done": ({ dir }) => {
				const distDir = dir.pathname ? new URL(dir).pathname : String(dir);
				const root = distDir.replace(/^\/([A-Za-z]:)/, "$1");
				const files = walkHtml(root);
				let changed = 0;
				let saved = 0;
				for (const f of files) {
					const before = fs.readFileSync(f, "utf8");
					const after = stripCommentsInHtml(before);
					if (after !== before) {
						fs.writeFileSync(f, after, "utf8");
						changed++;
						saved += before.length - after.length;
					}
				}
				console.log(
					`[strip-html-comments] ${changed}/${files.length} files cleaned, ${(saved / 1024).toFixed(1)} KB saved`,
				);
			},
		},
	};
}
