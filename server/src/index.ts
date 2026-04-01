// server/src/index.ts
console.log("\n🏁 SERVER_BOOT_START - Running entry point...\n");

import dns from "node:dns";
import express from "express";
import cors from "cors";
import dotenv from "dotenv";

// ── Global Error Handlers ──────────────────────────────────────────────
process.on("unhandledRejection", (reason, promise) => {
  const msg = `\n🛑 Unhandled Rejection at: ${promise} reason: ${reason}\n`;
  process.stderr.write(msg);
});

process.on("uncaughtException", (err) => {
  const msg = `\n🛑 Uncaught Exception:\n${err.stack || err}\n`;
  process.stderr.write(msg);
  setTimeout(() => process.exit(1), 500);
});

async function start(): Promise<void> {
  try {
    // DNS workaround for Windows MongoDB compatibility (Google Public DNS)
    if (process.platform === "win32") {
      process.stdout.write("📦 [Checkpoint 0] Running on Windows, applying DNS override...\n");
      dns.setServers(["8.8.8.8", "8.8.4.4"]);
    }

    dotenv.config();
    const app  = express();
    const PORT = process.env.PORT || 5000;

    process.stdout.write("📦 [Checkpoint 1] Loading local modules (db.js)...\n");
    const { connectDB } = await import("./db.js");

    process.stdout.write("📦 [Checkpoint 2] Loading routes (eligibility.js)...\n");
    const { default: eligibilityRoutes } = await import("./routes/eligibility.js");

    process.stdout.write("📦 [Checkpoint 3] Loading routes (schemes.js)...\n");
    const { default: schemesRoutes } = await import("./routes/schemes.js");

    process.stdout.write("📦 [Checkpoint 4] Loading routes (profiles.js)...\n");
    const { default: profilesRoutes } = await import("./routes/profiles.js");

    process.stdout.write("📦 [Checkpoint 5] Loading middleware (errorHandler.js)...\n");
    const { errorHandler } = await import("./middleware/errorHandler.js");

    process.stdout.write("📦 [Checkpoint 6] Setting up Express middleware...\n");
    const corsOptions = {
      origin: process.env.PROD_ORIGIN || ["http://localhost:3000", "http://127.0.0.1:3000"],
      methods: ["GET", "POST"],
      credentials: true,
    };

    app.use(cors(corsOptions));
    app.use(express.json({ limit: "10mb" }));
    app.use(express.urlencoded({ extended: true }));

    // ── Routes ────────────────────────────────────────────────────────────
    app.get("/api/health", (_req, res) => {
      res.set("Cache-Control", "no-store");
      res.json({ status: "ok", timestamp: new Date().toISOString() });
    });

    app.use("/api/eligibility", eligibilityRoutes);
    app.use("/api/schemes",     schemesRoutes);
    app.use("/api/profiles",    profilesRoutes);

    app.use(errorHandler);

    process.stdout.write("📦 [Checkpoint 7] Attempting to connect to MongoDB Atlas...\n");
    await connectDB();

    process.stdout.write("📦 [Checkpoint 8] Attempting to listen on port " + PORT + "...\n");
    app.listen(PORT, () => {
      process.stdout.write(`\n🚀 Niti-Setu RAG Server running on http://localhost:${PORT}\n`);
      process.stdout.write(`   Health:      GET  /api/health\n`);
      process.stdout.write(`   Schemes:     GET  /api/schemes\n`);
      process.stdout.write(`   Eligibility: POST /api/eligibility\n`);
      process.stdout.write(`   Upload PDF:  POST /api/schemes/upload\n\n`);
    });

  } catch (err) {
    const errorMsg = `\n❌ Failed to start server:\n${err instanceof Error ? err.stack : err}\n`;
    process.stderr.write(errorMsg);
    setTimeout(() => process.exit(1), 500);
  }
}

start();
