import { RequestHandler } from "express";

/**
 * Normalize "ids" parameter to exactly one level of encoding
 * Handles cases where frontend might send %252C (double-encoded) by mistake
 * @param raw - Raw ids parameter from query string
 * @returns Properly encoded string with %2C separators
 */
function normalizeIdsParam(raw: string): string {
  if (!raw) return "";

  try {
    // If we receive %252C (double-encoded), decode once -> %2C
    const once = decodeURIComponent(raw);
    if (/%2C/i.test(once)) return once; // already correct (%2C)
    if (/,/.test(once)) return once.replace(/,/g, "%2C"); // had commas -> encode once
  } catch (error) {
    // Ignore decode errors and continue with fallbacks
  }

  // Fallbacks
  if (/%2C/i.test(raw)) return raw; // correct already
  return raw.replace(/,/g, "%2C"); // encode commas once
}

/**
 * PDF preview endpoint - serves PDF inline for viewing in browser
 * Enhanced with timeout handling and ID normalization
 */
export const handlePdfPreview: RequestHandler = async (req, res) => {
  // Set timeout to prevent 504 errors
  const timeoutId = setTimeout(() => {
    if (!res.headersSent) {
      console.error("PDF Preview: Request timeout after 60 seconds");
      res.status(504).json({
        error: "Request timeout - PDF generation took too long",
        suggestion: "Try with fewer order numbers or try again later",
      });
    }
  }, 60000); // 60 second timeout

  try {
    const rawIds = String(req.query.ids || "");
    const ids = normalizeIdsParam(rawIds); // Ensure exactly one level of encoding
    // Support both query param and header for token
    const token = String(req.query.token || req.headers["x-auth-token"] || "");

    // Validate required parameters
    if (!ids) {
      clearTimeout(timeoutId);
      res.status(400).json({ error: "Missing ids parameter" });
      return;
    }

    if (!token) {
      clearTimeout(timeoutId);
      res.status(400).json({
        error: "Missing token parameter",
        suggestion:
          "Provide token as query param (?token=...) or X-Auth-Token header",
      });
      return;
    }

    // Count the number of IDs for logging
    const idCount = ids.split("%2C").length;

    // Build upstream URL - ids is already properly encoded, do NOT re-encode
    const url = `https://admin.fargo.uz/file/order/airwaybill_mini?ids=${ids}`;

    console.log(`👁️ PDF Preview: serving ${idCount} airwaybills inline`);
    if (rawIds !== ids) {
      console.log(`🔧 ID normalization: ${rawIds} -> ${ids}`);
    }

    // Create abort controller for fetch timeout
    const abortController = new AbortController();
    const fetchTimeoutId = setTimeout(() => abortController.abort(), 55000); // 55s for fetch

    try {
      // Make request to upstream server with authorization cookie
      const response = await fetch(url, {
        method: "GET",
        headers: {
          Cookie: `w-jwt=${token}`,
          Accept: "application/pdf",
          "User-Agent": "PDF-Preview/1.0",
        },
        signal: abortController.signal,
      });

      clearTimeout(fetchTimeoutId);

      // Handle upstream errors
      if (!response.ok) {
        console.error(
          `PDF Preview error: ${response.status} ${response.statusText}`,
        );

        clearTimeout(timeoutId);

        if (response.status === 401) {
          res.status(401).json({
            error: "Authorization failed - token may be expired",
            suggestion: "Please log in again",
          });
          return;
        }

        const errorText = await response.text().catch(() => "Unknown error");
        res.status(response.status).json({
          error: `Upstream server error: ${response.status} ${response.statusText}`,
          details: errorText,
        });
        return;
      }

      // Set response headers for inline viewing
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        'inline; filename="airwaybills.pdf"',
      );

      // Copy content-length if available
      const contentLength = response.headers.get("content-length");
      if (contentLength) {
        res.setHeader("Content-Length", contentLength);
      }

      // Stream the PDF response with error handling
      if (response.body) {
        const reader = response.body.getReader();
        let bytesRead = 0;

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            bytesRead += value.length;
            res.write(Buffer.from(value));

            // Check if client disconnected
            if (res.destroyed) {
              console.log("PDF Preview: Client disconnected");
              break;
            }
          }
        } finally {
          reader.releaseLock();
        }

        console.log(
          `✅ PDF Preview: successfully streamed ${bytesRead} bytes for ${idCount} airwaybills`,
        );
      }

      res.end();
      clearTimeout(timeoutId);
    } catch (fetchError: any) {
      clearTimeout(fetchTimeoutId);
      clearTimeout(timeoutId);

      if (fetchError.name === "AbortError") {
        console.error("PDF Preview: Fetch timeout");
        if (!res.headersSent) {
          res.status(504).json({
            error: "PDF generation timeout",
            suggestion:
              "The PDF service is taking too long. Try with fewer orders or try again later.",
          });
        }
        return;
      }

      throw fetchError;
    }
  } catch (error) {
    clearTimeout(timeoutId);
    console.error("PDF Preview error:", error);

    if (!res.headersSent) {
      res.status(500).json({
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
        suggestion: "Please try again or contact support if the issue persists",
      });
    }
  }
};

/**
 * PDF proxy endpoint to handle cross-domain cookie issues
 * Enhanced with timeout handling and ID normalization
 */
export const handlePdfProxy: RequestHandler = async (req, res) => {
  // Set timeout to prevent 504 errors
  const timeoutId = setTimeout(() => {
    if (!res.headersSent) {
      console.error("PDF Proxy: Request timeout after 60 seconds");
      res.status(504).json({
        error: "Request timeout - PDF generation took too long",
        suggestion: "Try with fewer order numbers or try again later",
      });
    }
  }, 60000); // 60 second timeout

  try {
    const rawIds = String(req.query.ids || "");
    const ids = normalizeIdsParam(rawIds); // Ensure exactly one level of encoding
    // Support both query param and header for token
    const token = String(req.query.token || req.headers["x-auth-token"] || "");

    // Validate required parameters
    if (!ids) {
      clearTimeout(timeoutId);
      res.status(400).json({ error: "Missing ids parameter" });
      return;
    }

    if (!token) {
      clearTimeout(timeoutId);
      res.status(400).json({
        error: "Missing token parameter",
        suggestion:
          "Provide token as query param (?token=...) or X-Auth-Token header",
      });
      return;
    }

    // Build upstream URL - ids is already properly encoded, do NOT re-encode
    const url = `https://admin.fargo.uz/file/order/airwaybill_mini?ids=${ids}`;

    console.log(
      `📄 PDF Proxy: fetching ${ids.split("%2C").length} airwaybills`,
    );
    if (rawIds !== ids) {
      console.log(`🔧 ID normalization: ${rawIds} -> ${ids}`);
    }

    // Create abort controller for fetch timeout
    const abortController = new AbortController();
    const fetchTimeoutId = setTimeout(() => abortController.abort(), 55000); // 55s for fetch

    try {
      // Make request to upstream server with authorization cookie
      const response = await fetch(url, {
        method: "GET",
        headers: {
          Cookie: `w-jwt=${token}`,
          Accept: "application/pdf",
          "User-Agent": "PDF-Proxy/1.0",
        },
        signal: abortController.signal,
      });

      clearTimeout(fetchTimeoutId);

      // Handle upstream errors
      if (!response.ok) {
        console.error(
          `PDF Proxy error: ${response.status} ${response.statusText}`,
        );

        clearTimeout(timeoutId);

        if (response.status === 401) {
          res.status(401).json({
            error: "Authorization failed - token may be expired",
            suggestion: "Please log in again",
          });
          return;
        }

        // Try to get error text
        const errorText = await response.text().catch(() => "Unknown error");
        res.status(response.status).json({
          error: `Upstream server error: ${response.status} ${response.statusText}`,
          details: errorText,
        });
        return;
      }

      // Check content type
      const contentType = response.headers.get("content-type");
      if (!contentType?.includes("application/pdf")) {
        console.warn(
          `PDF Proxy warning: unexpected content-type: ${contentType}`,
        );
      }

      // Set response headers
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        'attachment; filename="airwaybills.pdf"',
      );

      // Copy content-length if available
      const contentLength = response.headers.get("content-length");
      if (contentLength) {
        res.setHeader("Content-Length", contentLength);
      }

      // Stream the PDF response
      if (response.body) {
        const reader = response.body.getReader();
        let bytesRead = 0;

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            bytesRead += value.length;
            res.write(Buffer.from(value));

            // Check if client disconnected
            if (res.destroyed) {
              console.log("PDF Proxy: Client disconnected");
              break;
            }
          }
        } finally {
          reader.releaseLock();
        }

        console.log(`✅ PDF Proxy: successfully streamed ${bytesRead} bytes`);
      }

      res.end();
      clearTimeout(timeoutId);
    } catch (fetchError: any) {
      clearTimeout(fetchTimeoutId);
      clearTimeout(timeoutId);

      if (fetchError.name === "AbortError") {
        console.error("PDF Proxy: Fetch timeout");
        if (!res.headersSent) {
          res.status(504).json({
            error: "PDF generation timeout",
            suggestion:
              "The PDF service is taking too long. Try with fewer orders or try again later.",
          });
        }
        return;
      }

      throw fetchError;
    }
  } catch (error) {
    clearTimeout(timeoutId);
    console.error("PDF Proxy error:", error);

    if (!res.headersSent) {
      res.status(500).json({
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
        suggestion: "Please try again or contact support if the issue persists",
      });
    }
  }
};
