// Dev log sidecar: appends text/plain POSTs to http://127.0.0.1:4790/log into Logs/Game.log (started by LogServerSidecar.mjs).
import { appendFileSync, mkdirSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LogDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../Logs");
const LogFile = path.join(LogDirectory, "Game.log");
mkdirSync(LogDirectory, { recursive: true });

createServer((request, response) => {
	response.setHeader("Access-Control-Allow-Origin", "*");
	response.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
	response.setHeader("Access-Control-Allow-Headers", "Content-Type");
	if (request.method === "OPTIONS") return void response.writeHead(204).end();
	if (request.method !== "POST" || request.url !== "/log") return void response.writeHead(404).end();
	const chunks = [];
	request.on("data", (chunk) => chunks.push(chunk));
	request.on("end", () => {
		appendFileSync(LogFile, Buffer.concat(chunks).toString("utf8") + "\n");
		response.writeHead(204).end();
	});
}).listen(4790, "127.0.0.1");
