import rawProfile from "../data/profile.json";
import type { ProfileConfig } from "../types/config";
import {
	asArray,
	asRecord,
	bool,
	isUsableUrl,
	num,
	str,
} from "../utils/cms-value";

/**
 * 作者资料由后台（Sveltia CMS）写进 `src/data/profile.json`。
 *
 * ⚠️ `name` 是作者名的唯一来源，影响侧栏卡片、页脚版权、RSS/Atom、
 * SEO author、结构化数据、分享卡、OG 图等多处；改这里等于全站改名。
 *
 * 后台可能写出缺字段 / 类型不对的内容，所以一律走兜底取值，绝不 throw。
 */
const profile = asRecord(rawProfile);

function readLinks(): ProfileConfig["links"] {
	return (
		asArray(profile?.links)
			.map((item) => asRecord(item))
			.filter((item): item is Record<string, unknown> => item !== undefined)
			.map((item) => ({
				name: str(item.name, ""),
				url: str(item.url, ""),
				icon: str(item.icon, ""),
			}))
			// 社交图标要 name / url / icon 三者齐全才有意义，缺一个就整条丢掉
			.filter(
				(link) => link.name && link.url && link.icon && isUsableUrl(link.url),
			)
	);
}

function readTypewriter(): ProfileConfig["typewriter"] {
	const raw = asRecord(profile?.typewriter);
	if (!raw) return { enable: false, speed: 80 };
	return {
		enable: bool(raw.enable, false),
		speed: num(raw.speed, 80, { min: 0, max: 2000 }),
	};
}

export const profileConfig: ProfileConfig = {
	avatar: str(profile?.avatar, "assets/images/avatar.webp"),
	name: str(profile?.name, "SupplyToy"),
	bio: str(
		profile?.bio,
		"Independent toy reviews and buying guides for parents of children aged 0 to 12.",
	),
	typewriter: readTypewriter(),
	links: readLinks(),
};
