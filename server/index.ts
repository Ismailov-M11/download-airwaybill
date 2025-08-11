import "dotenv/config";
import express from "express";
import cors from "cors";
import { handleDemo } from "./routes/demo";
import { handlePdfProxy, handlePdfPreview } from "./routes/pdf";

export function createServer() {
  const app = express();

  // Middleware
  app.use(cors());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Example API routes
  app.get("/api/ping", (_req, res) => {
    const ping = process.env.PING_MESSAGE ?? "ping";
    res.json({ message: ping });
  });

  app.get("/api/demo", handleDemo);

  // PDF proxy endpoint for cross-domain cookie handling
  app.get("/api/pdf", handlePdfProxy);

  // PDF preview endpoint for viewing PDFs inline in browser
  app.get("/api/pdf/preview", handlePdfPreview);

  return app;
}
