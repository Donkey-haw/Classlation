import express from "express";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const app = express();
const port = Number(process.env.PORT || 4173);
const clientDirectory = resolve(process.cwd(), "dist/client");

app.get("/api/health", (_request, response) => response.json({ ok: true, app: "classroom-charades" }));

if (existsSync(clientDirectory)) {
  app.use(express.static(clientDirectory));
  app.get("*path", (_request, response) => response.sendFile(resolve(clientDirectory, "index.html")));
} else {
  app.get("*path", (_request, response) => response.status(503).send("먼저 pnpm build를 실행해 주세요."));
}

app.listen(port, "0.0.0.0", () => console.log(`Classroom Charades: http://localhost:${port}`));
