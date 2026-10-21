import navigationData from "../data/navigation.json";
import type { NavBarConfig, NavBarLink } from "../types/config";

/**
 * 导航栏菜单配置
 *
 * ══════════════════════════════════════════════════════════════
 * 菜单内容不在这里改，去后台改
 * ══════════════════════════════════════════════════════════════
 *
 * 数据源：`src/data/navigation.json`
 * 后台入口：https://supplytoy.com/admin/  →  「站点设置」→「顶部导航菜单」
 * 保存后提交到 GitHub 并自动重新构建发布（约 2 分钟生效）。
 *
 * 本文件只负责把 JSON 转成主题需要的结构，一般情况下不需要改动。
 *
 * ──────────────────────────────────────────────────────────────
 * 单个菜单项支持的字段
 * ──────────────────────────────────────────────────────────────
 *
 *   name      菜单显示的文字（必填）
 *   url       链接地址（必填）。站内写 "/posts" 这种以斜杠开头的路径；
 *             站外必须写完整地址，如 "https://www.amazon.com"
 *   icon      可选。Iconify 图标名，格式 "集合名:图标名"，如 "material-symbols:home"。
 *             ⚠️ 本站只打包了 material-symbols / mdi / fa7-solid / fa7-regular /
 *             fa7-brands / simple-icons 六个集合，且图标名必须是集合里真实存在的，
 *             否则会被构建脚本静默丢弃、菜单上不显示图标。
 *             ⚠️ 屏幕宽度小于 1024px 时导航只显示图标、隐藏文字，
 *             所以每个菜单项都建议配上图标。图标库：https://icon-sets.iconify.design/
 *   external  可选，true 表示外部链接：新标签页打开，并显示外链标识
 *   children  可选，子菜单（下拉菜单），支持同样的字段（可无限嵌套，但界面只渲染一级下拉）
 *
 * ──────────────────────────────────────────────────────────────
 * 注意事项
 * ──────────────────────────────────────────────────────────────
 *
 * 1. links 数组的顺序即导航栏从左到右的显示顺序。
 * 2. 若某菜单项的 url 指向主题自带但已关闭的演示页面（/anime/ /diary/ /friends/
 *    /projects/ /skills/ /timeline/ /albums/ /devices/），导航栏会自动隐藏该项。
 * 3. 移动端会自动收拢为汉堡菜单，子菜单以折叠面板形式展示。
 */

type RawNavLink = {
	name?: unknown;
	url?: unknown;
	icon?: unknown;
	external?: unknown;
	children?: unknown;
};

/**
 * 把 JSON 里的一项转成主题的 NavBarLink。
 * 字段缺失或类型不对时返回 null（跳过该项），
 * 而不是抛错 —— 避免后台误改导致整站构建失败。
 */
function toNavBarLink(raw: RawNavLink | null | undefined): NavBarLink | null {
	if (!raw || typeof raw !== "object") {
		return null;
	}

	const name = typeof raw.name === "string" ? raw.name.trim() : "";
	const linkUrl = typeof raw.url === "string" ? raw.url.trim() : "";

	// 名称与链接缺一不可，否则该项没有意义
	if (!name || !linkUrl) {
		return null;
	}

	const link: NavBarLink = { name, url: linkUrl };

	if (typeof raw.icon === "string" && raw.icon.trim() !== "") {
		link.icon = raw.icon.trim();
	}

	if (raw.external === true) {
		link.external = true;
	}

	if (Array.isArray(raw.children) && raw.children.length > 0) {
		const children = raw.children
			.map((child) => toNavBarLink(child as RawNavLink))
			.filter((child): child is NavBarLink => child !== null);
		if (children.length > 0) {
			link.children = children;
		}
	}

	return link;
}

const rawLinks: RawNavLink[] = Array.isArray(navigationData.links)
	? (navigationData.links as RawNavLink[])
	: [];

export const navBarConfig: NavBarConfig = {
	links: rawLinks
		.map(toNavBarLink)
		.filter((link): link is NavBarLink => link !== null),
};
