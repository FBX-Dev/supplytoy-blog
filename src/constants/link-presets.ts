import I18nKey from "@i18n/i18nKey";
import { i18n } from "@i18n/translation";

import { LinkPreset, type NavBarLink } from "@/types/config";

export const LinkPresets: Record<LinkPreset, NavBarLink> = {
	[LinkPreset.Home]: {
		name: i18n(I18nKey.home),
		url: "/",
		icon: "material-symbols:home",
	},
	[LinkPreset.About]: {
		name: i18n(I18nKey.about),
		url: "/categories",
		icon: "material-symbols:person",
	},
	// ⚠️ 本站没有 /archive 归档页（线上实测 404）。分类入口用 /categories。
	[LinkPreset.Archive]: {
		name: i18n(I18nKey.archive),
		url: "/categories",
		icon: "material-symbols:archive",
	},
	// ⚠️ 本站的链接页是 /friend-links（/friends 线上是 404）
	[LinkPreset.Friends]: {
		name: i18n(I18nKey.friends),
		url: "/friend-links",
		icon: "material-symbols:group",
	},
	[LinkPreset.Anime]: {
		name: i18n(I18nKey.anime),
		url: "/anime/",
		icon: "material-symbols:movie",
	},
	[LinkPreset.Diary]: {
		name: i18n(I18nKey.diary),
		url: "/diary/",
		icon: "material-symbols:book",
	},
	[LinkPreset.Albums]: {
		name: i18n(I18nKey.albums),
		url: "/albums/",
		icon: "material-symbols:photo-library",
	},
	[LinkPreset.Projects]: {
		name: i18n(I18nKey.projects),
		url: "/projects/",
		icon: "material-symbols:work",
	},
	[LinkPreset.Skills]: {
		name: i18n(I18nKey.skills),
		url: "/skills/",
		icon: "material-symbols:psychology",
	},
	[LinkPreset.Timeline]: {
		name: i18n(I18nKey.timeline),
		url: "/timeline/",
		icon: "material-symbols:timeline",
	},
	[LinkPreset.AITools]: {
		name: i18n(I18nKey.aiTools),
		url: "/ai-tools/",
		icon: "material-symbols:smart-toy",
	},
};
