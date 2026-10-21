import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { describe, it } from "node:test";

const astroConfig = await readFile(
	new URL("../astro.config.mjs", import.meta.url),
	"utf8",
);
const layoutSource = await readFile(
	new URL("../src/layouts/Layout.astro", import.meta.url),
	"utf8",
);
const mainStyles = await readFile(
	new URL("../src/styles/main.css", import.meta.url),
	"utf8",
);
const configTypes = await readFile(
	new URL("../src/types/config.ts", import.meta.url),
	"utf8",
);
const fontModeSource = await readFile(
	new URL("../src/utils/fontMode.ts", import.meta.url),
	"utf8",
);
const fontCheckSource = await readFile(
	new URL("../scripts/check-font-loading.mjs", import.meta.url),
	"utf8",
);

describe("Custom font loading boundary", () => {
	it("loads both display fonts from Fontsource and ships no local font binaries", async () => {
		// 拉丁（Inter）与中文（Noto Sans SC）都在构建时由 Fontsource 下载并自托管，
		// 仓库里不再存放字体二进制，避免体积与许可分发上的麻烦。
		assert.match(
			astroConfig,
			/name: "Inter"[\s\S]{0,400}?cssVariable: "--font-body"[\s\S]{0,400}?provider: fontProviders\.fontsource\(\)/,
		);
		assert.match(
			astroConfig,
			/name: "Noto Sans SC"[\s\S]{0,400}?cssVariable: "--font-cjk"[\s\S]{0,400}?provider: fontProviders\.fontsource\(\)/,
		);
		assert.doesNotMatch(astroConfig, /fontProviders\.local\(\)/);
		assert.doesNotMatch(astroConfig, /src: \[[^\]]+\.(?:ttf|otf|woff2?)/);

		let leftover = [];
		try {
			leftover = (await readdir(new URL("../src/assets/fonts", import.meta.url))).filter(
				(name) => /\.(?:ttf|otf|woff2?)$/i.test(name),
			);
		} catch (error) {
			if (error?.code !== "ENOENT") throw error;
		}
		assert.deepEqual(
			leftover,
			[],
			"local font binaries should have been removed in favour of Fontsource",
		);
	});

	it("preserves PR #502's Latin -> CJK fallback contract", () => {
		assert.equal((astroConfig.match(/fallbacks: \[\]/g) ?? []).length, 2);
		assert.equal(
			(astroConfig.match(/optimizedFallbacks: false/g) ?? []).length,
			2,
		);
		assert.match(
			astroConfig,
			/name: "Inter"[\s\S]{0,400}?weights: \[400, 500, 600, 700\]/,
		);
		assert.match(
			astroConfig,
			/name: "Noto Sans SC"[\s\S]{0,400}?weights: \[400, 500, 700\][\s\S]{0,200}?subsets: \["chinese-simplified"\]/,
		);
		// 拉丁字体必须排在中文之前，否则中文字形不会被考虑
		assert.ok(
			astroConfig.indexOf('cssVariable: "--font-body"') <
				astroConfig.indexOf('cssVariable: "--font-cjk"'),
		);

		const bodyIndex = mainStyles.indexOf("var(--font-body");
		const cjkIndex = mainStyles.indexOf("var(--font-cjk");
		assert.ok(bodyIndex >= 0 && cjkIndex > bodyIndex);
	});

	it("only renders Astro Font components when custom mode is enabled", () => {
		assert.match(astroConfig, /fonts:\s*customFontsEnabled\s*\?\s*\[/);
		assert.equal(
			(layoutSource.match(/customFontsEnabled\s*&&\s*<Font/g) ?? []).length,
			3,
		);
	});

	it("keeps src-wide globs image-filtered so font binaries are never emitted", async () => {
		// `import.meta.glob("../../**")` 会把 src/ 下的字体二进制也塞进 Vite 资源图，
		// 让 20MB+ 的死资源进入 dist。所有跨 src 的 glob 都必须限定图片扩展名。
		const postPage = await readFile(
			new URL("../src/pages/posts/[...slug].astro", import.meta.url),
			"utf8",
		);
		assert.doesNotMatch(postPage, /import\.meta\.glob<ImageMetadata>\(\s*"\.\.\/\.\.\/\*\*"/);
		assert.equal(
			(
				postPage.match(
					/import\.meta\.glob<ImageMetadata>\(\s*"\.\.\/\.\.\/\*\*\/\*\.\{[^}]+\}"/g,
				) ?? []
			).length,
			2,
		);
	});

	it("defaults older configurations without a font block to custom mode", () => {
		assert.match(configTypes, /font\?:\s*{\s*mode\?:\s*"custom" \| "system"/);
		assert.match(
			fontModeSource,
			/environmentMode\s*\?\?\s*config\.font\?\.mode\s*\?\?\s*"custom"/,
		);
	});

	it("checks the font files referenced by output instead of a fixed directory", () => {
		assert.match(fontCheckSource, /FONT_REFERENCE_PATTERN/);
		assert.match(fontCheckSource, /CUSTOM_FONT_VARIABLE_PATTERN/);
		assert.match(fontCheckSource, /referencedFontFiles/);
		assert.doesNotMatch(
			fontCheckSource,
			/join\(distDir,\s*"_astro",\s*"fonts"\)/,
		);
	});
});
