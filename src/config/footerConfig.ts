import rawFooter from "../data/footer.json";
import type { FooterConfig } from "../types/config";
import { asRecord, bool, optString } from "../utils/cms-value";

/**
 * 页脚自定义内容由后台（Sveltia CMS）写进 `src/data/footer.json`。
 *
 * `customHtml` 会被原样注入页面，属于可信内容（只有后台能写），
 * 所以这里不做 HTML 转义 —— 但也不允许出现 `undefined` 字样。
 */
const footer = asRecord(rawFooter);

export const footerConfig: FooterConfig = {
	enable: bool(footer?.enable, false),
	customHtml: optString(footer?.customHtml) ?? "",
};
