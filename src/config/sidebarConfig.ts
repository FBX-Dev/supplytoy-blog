import type { SidebarLayoutConfig } from "../types/config";

/**
 * 侧边栏布局配置
 * 用于控制侧边栏组件的显示、排序、动画和响应式行为
 * sidebar: 控制组件所在的侧边栏（left 或 right）。注意：移动端通常不显示右侧栏内容。若组件设置在 right，请确保 layout.position 为 "both"。
 */
export const sidebarLayoutConfig: SidebarLayoutConfig = {
	// 侧边栏组件属性配置列表
	properties: [
		{
			// 组件类型：用户资料组件
			type: "profile",
			// 组件位置："top" 表示固定在顶部
			position: "top",
			// CSS 类名，用于应用样式和动画
			class: "onload-animation",
			// 动画延迟时间（毫秒），用于错开动画效果
			animationDelay: 0,
		},
		{
			// 组件类型：公告组件
			type: "announcement",
			// 组件位置："top" 表示固定在顶部
			position: "top",
			// CSS 类名
			class: "onload-animation",
			// 动画延迟时间
			animationDelay: 50,
		},
		{
			// 组件类型：侧栏音乐组件
			// 🔴 本站是商业导购站，个人博客的音乐播放器已精简掉。
			// 保留在 properties 里（主题按 type 查表），但不挂进任何栏位。
			type: "music-sidebar",
			position: "sticky",
			class: "onload-animation",
			animationDelay: 100,
		},
		{
			// 组件类型：分类组件
			type: "categories",
			// 组件位置："sticky" 表示粘性定位，可滚动
			position: "sticky",
			// CSS 类名
			class: "onload-animation",
			// 动画延迟时间
			animationDelay: 150,
			// 响应式配置
			responsive: {
				// 折叠阈值：当分类数量超过5个时自动折叠
				collapseThreshold: 5,
			},
		},
		{
			// 组件类型：标签组件
			type: "tags",
			// 组件位置："sticky" 表示粘性定位
			position: "top",
			// CSS 类名
			class: "onload-animation",
			// 动画延迟时间
			animationDelay: 250,
			// 响应式配置
			responsive: {
				// 折叠阈值：当标签数量超过20个时自动折叠
				collapseThreshold: 20,
			},
		},
		{
			// 组件类型：卡片式目录组件
			type: "card-toc",
			// 组件位置
			position: "sticky",
			// CSS 类名
			class: "onload-animation",
			// 动画延迟时间
			animationDelay: 200,
		},
		{
			// 组件类型：站点统计组件
			type: "site-stats",
			// 组件位置
			position: "top",
			// CSS 类名
			class: "onload-animation",
			// 动画延迟时间
			animationDelay: 200,
		},
		{
			// 组件类型：日历组件(移动端不显示)
			type: "calendar",
			// 组件位置
			position: "top",
			// CSS 类名
			class: "onload-animation",
			// 动画延迟时间
			animationDelay: 250,
		},
	],

	// 侧栏组件布局配置
	//
	// 🔴 两条硬约束（改这里前先读）：
	//
	// 1. **同一个组件不要出现在多个栏位**。主题会把每个栏位的组件都完整渲染一遍，
	//    `tags` 同时挂在 left + drawer 会让每页输出 3 份标签云
	//    （实测 954 个标签链接，而线上老站只有 313 个），页面从 130KB 涨到 400KB，
	//    301 个标签页因此膨胀到 101MB。
	//
	// 2. `drawer` 是**移动端抽屉**，桌面端不显示。但它同样参与服务端渲染，
	//    所以移动端必须保留的组件（profile / announcement / 导航类）才放这里。
	//    桌面端已有的内容组件（tags / categories）放 drawer 纯属重复输出。
	//
	// 本站精简后的侧栏：左栏放作者卡片 + 公告 + 文章目录；
	// 右栏放站点统计 + 分类 + 日历。
	// 标签入口由顶部导航 `/tags` 承担，不再在侧栏堆一整片标签云。
	components: {
		left: ["profile", "announcement", "card-toc"],
		right: ["site-stats", "calendar", "categories"],
		drawer: ["profile", "announcement", "categories"],
	},

	// 默认动画配置
	defaultAnimation: {
		// 是否启用默认动画
		enable: true,
		// 基础延迟时间（毫秒）
		baseDelay: 0,
		// 递增延迟时间（毫秒），每个组件依次增加的延迟
		increment: 50,
	},

	// 响应式布局配置
	responsive: {
		// 断点配置（像素值）
		breakpoints: {
			// 移动端断点：屏幕宽度小于768px
			mobile: 768,
			// 平板端断点：屏幕宽度小于1280px
			tablet: 1280,
			// 桌面端断点：屏幕宽度大于等于1280px
			desktop: 1280,
		},
	},
};
