const http = require("node:http");
const fs = require("node:fs");
const p = require("node:path");
const root = "D:/workbuddy/info/site/supplytoy-astro/dist";
const mime = {
	".html": "text/html;charset=utf-8",
	".css": "text/css",
	".js": "application/javascript",
	".webp": "image/webp",
	".png": "image/png",
	".ico": "image/x-icon",
	".xml": "application/xml",
	".json": "application/json",
	".svg": "image/svg+xml",
	".woff2": "font/woff2",
};
function find(u) {
	const cands = [u, `${u}.html`, p.join(u, "index.html")];
	for (const c of cands) {
		const f = p.join(root, c);
		if (fs.existsSync(f) && fs.statSync(f).isFile()) return f;
	}
	return null;
}
http
	.createServer((req, res) => {
		const u = decodeURIComponent(req.url.split("?")[0]);
		const f = find(u);
		if (!f) {
			res.writeHead(404);
			return res.end("404");
		}
		res.writeHead(200, {
			"Content-Type": mime[p.extname(f)] || "application/octet-stream",
		});
		fs.createReadStream(f).pipe(res);
	})
	.listen(4399, () => console.log("local dist server on 4399"));
