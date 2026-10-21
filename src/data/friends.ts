import rawFriends from "../data/friends.json";
import { asArray, asRecord, isUsableUrl, str, strArray } from "../utils/cms-value";

// 友情链接数据配置
//
// 数据由后台（Sveltia CMS）写进 `src/data/friends.json`，这里只做读取与兜底。
// 页面渲染依赖 `new URL(siteurl)`，所以 siteurl 不合法（相对路径 / 乱填）的条目直接丢弃，
// 否则一张卡片就能把整个友链页的构建搞崩。

export interface FriendItem {
	id: number;
	title: string;
	imgurl: string;
	desc: string;
	siteurl: string;
	tags: string[];
}

function readFriends(): FriendItem[] {
	return asArray(asRecord(rawFriends)?.list)
		.map((item) => asRecord(item))
		.filter((item): item is Record<string, unknown> => item !== undefined)
		.map((item) => ({
			title: str(item.title, ""),
			siteurl: str(item.siteurl, ""),
			imgurl: str(item.imgurl, ""),
			desc: str(item.desc, ""),
			tags: strArray(item.tags),
		}))
		// 站点名与可访问地址是硬要求
		.filter(
			(friend) =>
				friend.title !== "" &&
				/^https?:\/\//i.test(friend.siteurl) &&
				isUsableUrl(friend.siteurl),
		)
		.map((friend, index) => ({ id: index + 1, ...friend }));
}

const friendsData: FriendItem[] = readFriends();

// 获取所有友情链接数据
export function getFriendsList(): FriendItem[] {
	return friendsData;
}

// 获取随机排序的友情链接数据
export function getShuffledFriendsList(): FriendItem[] {
	const shuffled = [...friendsData];
	for (let i = shuffled.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
	}
	return shuffled;
}
