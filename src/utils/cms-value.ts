/**
 * CMS 数据兜底取值工具
 *
 * 背景：站点的部分配置现在由后台（Sveltia CMS）写进 `src/data/*.json`，
 * 后台是手改的，随时可能写出缺字段、类型不对、甚至整个字段被删掉的内容。
 * 这些配置会被构建期和客户端一起使用，**一旦抛错就是整站构建失败或白屏**。
 *
 * 所以适配器一律走这里的取值函数：类型不对就退回默认值，绝不 throw。
 */

export function asRecord(value: unknown): Record<string, unknown> | undefined {
	return value !== null && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: undefined;
}

/** 取字符串；空串/纯空白视为「没填」，返回 undefined */
export function optString(value: unknown): string | undefined {
	if (typeof value !== "string") return undefined;
	const trimmed = value.trim();
	return trimmed ? trimmed : undefined;
}

/** 取字符串，没填就返回 fallback */
export function str(value: unknown, fallback: string): string {
	return optString(value) ?? fallback;
}

/** 取布尔；只有真正的 true 才算 true（"true" 这种字符串不认） */
export function bool(value: unknown, fallback: boolean): boolean {
	return typeof value === "boolean" ? value : fallback;
}

/** 取数字，并限制在 [min, max] 内；NaN / 非数字回退 */
export function num(
	value: unknown,
	fallback: number,
	range?: { min?: number; max?: number },
): number {
	let parsed: number | undefined;
	if (typeof value === "number" && Number.isFinite(value)) parsed = value;
	else if (typeof value === "string" && value.trim() !== "") {
		const n = Number(value);
		if (Number.isFinite(n)) parsed = n;
	}
	if (parsed === undefined) return fallback;

	if (range?.min !== undefined) parsed = Math.max(range.min, parsed);
	if (range?.max !== undefined) parsed = Math.min(range.max, parsed);
	return parsed;
}

/** 取字符串数组；过滤掉空项与非字符串 */
export function strArray(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return value
		.map((item) => optString(item))
		.filter((item): item is string => item !== undefined);
}

/** 取数组；不是数组就当空数组，方便安全地 .map */
export function asArray(value: unknown): unknown[] {
	return Array.isArray(value) ? value : [];
}

/** 只允许白名单里的字面量，其余回退 */
export function oneOf<T extends string>(
	value: unknown,
	allowed: readonly T[],
	fallback: T,
): T {
	return typeof value === "string" && (allowed as readonly string[]).includes(value)
		? (value as T)
		: fallback;
}

/** 校验是不是能拿去做 <a href> / new URL() 的绝对地址（http/https/mailto） */
export function isUsableUrl(value: string): boolean {
	if (/^(?:https?:|mailto:)/i.test(value)) {
		try {
			new URL(value);
			return true;
		} catch {
			return false;
		}
	}
	return value.startsWith("/");
}
