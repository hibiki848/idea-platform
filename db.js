// db.js
const mysql = require("mysql2/promise");

const baseUrl = process.env.MYSQL_URL;          // Railwayの参照 or 手動上書き
const dbName  = process.env.MYSQL_DATABASE;     // idea_platform

if (!baseUrl) throw new Error("MYSQL_URL is missing");
if (!dbName)  throw new Error("MYSQL_DATABASE is missing");

// baseUrl に /db が無ければ付ける
let finalUrl = baseUrl;
if (!/\/[^/?#]+/.test(baseUrl)) {
  finalUrl = `${baseUrl}/${dbName}`;
}

// すでに /something が付いてても、必ず /MYSQL_DATABASE に上書き
finalUrl = finalUrl.replace(/\/[^/?#]+(\?|#|$)/, `/${dbName}$1`);

console.log("[DB] using:", finalUrl.replace(/:\/\/.*?:.*?@/, "://***:***@")); // パス隠す

const db = mysql.createPool(finalUrl);

module.exports = db;
