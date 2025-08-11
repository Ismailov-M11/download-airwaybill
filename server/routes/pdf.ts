import { RequestHandler } from "express";

/**
 * Mask sensitive values for logging (show first N chars + length)
 */
function mask(v = "", keep = 8): string {
  if (!v) return "";
  return v.slice(0, keep) + "…(" + v.length + ")";
}

/**
 * Normalize ids to exactly one encoding of commas
 * Handles: %252C -> %2C (double-encoded), 1,2,3 -> 1%2C2%2C3 (raw), preserves 1%2C2%2C3
 */
function normalizeIdsParam(raw: string): string {
  if (!raw) return "";

  try {
    const once = decodeURIComponent(raw); // "%252C" -> "%2C" or "1,2,3"
    if (/%2C/i.test(once)) return once; // already correct
    if (/,/.test(once)) return once.replace(/,/g, "%2C"); // encode commas once
  } catch {
    /* ignore decode errors */
  }

  // Fallbacks
  if (/%2C/i.test(raw)) return raw; // correct already
  return raw.replace(/,/g, "%2C"); // encode commas once
}

/**
 * Hardened PDF proxy endpoint with debug headers and proper cookie handling
 * Fixes blank PDFs by ensuring correct encoding and upstream headers
 */
export const handlePdfProxy: RequestHandler = async (req, res) => {
  const rawIds = String(req.query.ids || "");
  const ids = normalizeIdsParam(rawIds);

  const jwt = String(req.headers["x-auth-token"] || "");
  const bh = String(req.headers["x-bh"] || process.env.W_BH || "");

  // Validate required parameters
  if (!ids) {
    res.status(400).json({ error: "Missing ids parameter" });
    return;
  }

  if (!jwt) {
    res.status(400).json({
      error: "Missing authentication token",
      suggestion: "Provide X-Auth-Token header with id_token",
    });
    return;
  }

  // Build cookie string (include w-bh if available)
  const cookie = ["w-jwt=" + jwt, bh ? "w-bh=" + bh : null]
    .filter(Boolean)
    .join("; ");

  const url = `https://admin.fargo.uz/file/order/airwaybill_mini?ids=${ids}`;

  const t0 = Date.now();
  console.log("[proxy→upstream]", {
    url,
    cookie: `w-jwt=${mask(jwt)}; w-bh=${mask(bh)}`,
    referer: "https://admin.fargo.uz/dashboard/order/list",
  });

  try {
    // Make upstream request with all required headers
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Cookie: cookie,
        Accept: "application/pdf",
        Referer: "https://admin.fargo.uz/dashboard/order/list",
        "User-Agent": "Mozilla/5.0 (compatible; PDF-Proxy/1.0)",
      },
    });

    const buf = Buffer.from(await response.arrayBuffer());
    const ms = Date.now() - t0;

    // Set debug headers (visible in DevTools)
    res.setHeader(
      "Access-Control-Expose-Headers",
      "X-Dbg-Ids,X-Dbg-Url,X-Dbg-Upstream-Status,X-Dbg-Bytes,X-Dbg-Time",
    );
    res.setHeader("X-Dbg-Ids", ids);
    res.setHeader("X-Dbg-Url", url);
    res.setHeader("X-Dbg-Upstream-Status", String(response.status));
    res.setHeader("X-Dbg-Bytes", String(buf.length));
    res.setHeader("X-Dbg-Time", String(ms));

    // Quick sanity check for PDF format
    if (!buf.slice(0, 5).toString().startsWith("%PDF-")) {
      console.warn(
        "[proxy] upstream not starting with %PDF, first bytes:",
        buf.slice(0, 16).toString("hex"),
      );
    }

    if (!response.ok) {
      console.error(
        "[proxy] upstream error",
        response.status,
        buf.slice(0, 200).toString(),
      );
      res.status(response.status).send(buf.toString());
      return;
    }

    console.log("[proxy] ok", {
      status: response.status,
      bytes: buf.length,
      ms,
      idsCount: ids.split("%2C").length,
    });

    res.setHeader("Content-Type", "application/pdf");
    res.end(buf);
  } catch (error) {
    console.error("[proxy] fetch error:", error);
    res.status(500).json({
      error: "Failed to fetch PDF from upstream",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

/**
 * Legacy PDF preview endpoint (for backward compatibility)
 * Redirects to the main proxy with proper headers
 */
export const handlePdfPreview: RequestHandler = async (req, res) => {
  console.log("[preview] redirecting to main proxy endpoint");

  // Extract parameters
  const ids = String(req.query.ids || "");
  const token = String(req.query.token || req.headers["x-auth-token"] || "");

  if (!ids || !token) {
    res.status(400).json({
      error: "Missing required parameters",
      suggestion: "Use /api/pdf with X-Auth-Token header instead",
    });
    return;
  }

  // Set headers and redirect to main proxy
  req.headers["x-auth-token"] = token;
  return handlePdfProxy(req, res);
};
