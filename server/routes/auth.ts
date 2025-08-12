import { RequestHandler } from "express";

/**
 * Authenticate with Fargo admin to get w-bh token
 * This endpoint handles the server-side authentication with admin.fargo.uz
 */
export const handleFargoAuth: RequestHandler = async (req, res) => {
  try {
    const { action } = req.body;
    const idToken = String(req.headers["x-auth-token"] || "");

    if (!idToken) {
      res.status(400).json({
        error: "Missing authentication token",
        suggestion: "Provide X-Auth-Token header with id_token",
      });
      return;
    }

    if (action === "get_w_bh") {
      await getWBhToken(req, res, idToken);
    } else {
      res.status(400).json({ error: "Invalid action" });
    }
  } catch (error) {
    console.error("Fargo auth error:", error);
    res.status(500).json({
      error: "Failed to authenticate with Fargo",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

/**
 * Get w-bh token by making authenticated request to admin.fargo.uz
 */
async function getWBhToken(req: any, res: any, idToken: string): Promise<void> {
  try {
    console.log("🔐 Attempting to get w-bh token from admin.fargo.uz");

    // Method 1: Try to access a Fargo admin endpoint that would set the w-bh cookie
    let fargoResponse;
    try {
      fargoResponse = await fetch("https://admin.fargo.uz/api/orders?limit=1", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${idToken}`,
          Cookie: `w-jwt=${idToken}`,
          Accept: "application/json",
          "User-Agent": "Mozilla/5.0 (compatible; Airwaybill-System/1.0)",
          Referer: "https://admin.fargo.uz/dashboard",
        },
      });
    } catch (fetchError) {
      console.warn("⚠️ Failed to fetch from Fargo API:", fetchError);

      // Method 2: Try alternative endpoint
      try {
        fargoResponse = await fetch("https://admin.fargo.uz/dashboard", {
          method: "GET",
          headers: {
            Cookie: `w-jwt=${idToken}`,
            Accept: "text/html,application/xhtml+xml",
            "User-Agent": "Mozilla/5.0 (compatible; Airwaybill-System/1.0)",
          },
        });
      } catch (secondError) {
        console.warn("⚠️ Failed to fetch from Fargo dashboard:", secondError);
        throw new Error("Unable to connect to admin.fargo.uz");
      }
    }

    console.log(
      "📡 Fargo API response:",
      fargoResponse.status,
      fargoResponse.statusText,
    );

    // Extract cookies from response headers
    const setCookieHeaders = fargoResponse.headers.get("set-cookie");
    let wBhToken = null;

    if (setCookieHeaders) {
      // Parse Set-Cookie headers to find w-bh
      const cookies = setCookieHeaders.split(",");
      for (const cookie of cookies) {
        const trimmed = cookie.trim();
        if (trimmed.startsWith("w-bh=")) {
          wBhToken = trimmed.split("=")[1].split(";")[0];
          break;
        }
      }
    }

    if (wBhToken) {
      console.log("✅ Successfully extracted w-bh token from Fargo response");
      res.json({
        success: true,
        wBh: wBhToken,
        message: "w-bh token obtained successfully",
      });
    } else {
      console.warn("⚠️ No w-bh token found in Fargo response");

      // Fallback: use environment variable if available
      const envWBh = process.env.W_BH;
      if (envWBh) {
        console.log("📋 Using w-bh token from environment variable");
        res.json({
          success: true,
          wBh: envWBh,
          message: "Using w-bh token from environment",
        });
      } else {
        res.json({
          success: false,
          message: "Could not obtain w-bh token from Fargo or environment",
        });
      }
    }
  } catch (error) {
    console.error("❌ Error getting w-bh token:", error);
    res.status(500).json({
      error: "Failed to get w-bh token",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
