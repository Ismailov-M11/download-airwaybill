/**
 * Comprehensive PDF viewing utilities with same-origin and cross-origin support
 * Handles both direct URL access and server proxy approaches
 */

// Configuration flag - set based on deployment environment
export const SAME_ORIGIN = false; // Set to true if frontend is served from admin.fargo.uz

/**
 * Sets auth cookie for same-origin PDF access
 * Only works when frontend is served from admin.fargo.uz domain
 * @param idToken - JWT token from authentication
 */
export function setAuthCookie(idToken: string): void {
  // Set cookie without logging the token for security
  document.cookie = `w-jwt=${idToken}; path=/; secure; samesite=lax`;
}

/**
 * Opens PDF directly in new tab (same-origin approach)
 * Requires frontend to be on admin.fargo.uz domain
 * @param idsEncoded - URL-encoded comma-separated IDs (e.g., "123%2C456%2C789")
 */
export function openPdfInNewTabDirect(idsEncoded: string): void {
  const url = `https://admin.fargo.uz/file/order/airwaybill_mini?ids=${idsEncoded}`;
  window.open(url, "_blank", "noopener");
}

/**
 * Opens PDF via server proxy in new tab (cross-origin approach)
 * Works when frontend is on different domain than admin.fargo.uz
 * @param idsEncoded - URL-encoded comma-separated IDs (already encoded as id1%2Cid2%2C...)
 * @param idToken - JWT token for authentication
 * @param wBh - Optional w-bh cookie value (can be omitted if server reads from env)
 */
export async function openPdfInNewTabViaProxy(
  idsEncoded: string,
  idToken: string,
  wBh?: string,
): Promise<void> {
  // Fetch PDF through our hardened server proxy
  // IMPORTANT: idsEncoded is already properly encoded, do NOT re-encode with encodeURIComponent
  const response = await fetch(`/api/pdf?ids=${idsEncoded}`, {
    headers: {
      "X-Auth-Token": idToken,
      ...(wBh && { "X-BH": wBh, "X-W-BH": wBh }), // Send w-bh via multiple header names for compatibility
      Accept: "application/pdf",
    },
  });

  // Inspect debug headers (visible in DevTools → Network → Response Headers)
  console.log("🔍 PDF Debug Info:");
  console.log("  X-Dbg-Url:", response.headers.get("X-Dbg-Url"));
  console.log("  X-Dbg-Ids:", response.headers.get("X-Dbg-Ids"));
  console.log(
    "  X-Dbg-Upstream-Status:",
    response.headers.get("X-Dbg-Upstream-Status"),
  );
  console.log("  X-Dbg-Bytes:", response.headers.get("X-Dbg-Bytes"));
  console.log("  X-Dbg-Time:", response.headers.get("X-Dbg-Time"));

  // Handle authentication errors
  if (response.status === 401) {
    throw new Error("UNAUTHORIZED_401");
  }

  // Handle other errors
  if (!response.ok) {
    throw new Error(`PDF_FAILED_${response.status}`);
  }

  // Get PDF as blob
  const blob = await response.blob();

  // Check for empty or invalid PDF
  if (blob.size < 1000) {
    console.warn("⚠️ PDF blob is very small, might be empty or error page");
    throw new Error("Empty PDF received - authentication may have failed. Please try logging out and back in.");
  }

  // Additional check for actual PDF content
  const arrayBuffer = await blob.arrayBuffer();
  const uint8Array = new Uint8Array(arrayBuffer);
  const pdfHeader = String.fromCharCode(...uint8Array.slice(0, 4));

  if (pdfHeader !== "%PDF") {
    console.warn("⚠️ Response is not a valid PDF format");
    throw new Error("Invalid PDF format received - the server may have returned an error page instead of a PDF.");
  }

  // Create blob URL for viewing
  const blobUrl = URL.createObjectURL(blob);

  // Open in new tab
  window.open(blobUrl, "_blank", "noopener");

  // Clean up blob URL after 60 seconds
  setTimeout(() => {
    URL.revokeObjectURL(blobUrl);
  }, 60000);
}

/**
 * Safari/iOS fallback for popup blocker issues
 * Opens blank tab immediately, then loads PDF content
 * @param idsEncoded - URL-encoded comma-separated IDs
 * @param idToken - JWT token for authentication
 */
export async function openPdfInNewTabSafariFallback(
  idsEncoded: string,
  idToken: string,
): Promise<void> {
  // Open blank tab immediately (before any async operations)
  const newWindow = window.open("about:blank", "_blank", "noopener");

  if (!newWindow) {
    throw new Error("Unable to open new tab - popup blocked");
  }

  try {
    if (SAME_ORIGIN) {
      // Same-origin: set cookie and redirect to PDF URL
      setAuthCookie(idToken);
      const url = `https://admin.fargo.uz/file/order/airwaybill_mini?ids=${idsEncoded}`;
      newWindow.location.href = url;
    } else {
      // Cross-origin: fetch via proxy and load blob
      // Note: idsEncoded is already properly encoded, do NOT encode again
      const wBhFromCookie = document.cookie
        .split("; ")
        .find((row) => row.startsWith("w-bh="))
        ?.split("=")[1];
      const response = await fetch(`/api/pdf?ids=${idsEncoded}`, {
        headers: {
          "X-Auth-Token": idToken,
          ...(wBhFromCookie && {
            "X-BH": wBhFromCookie,
            "X-W-BH": wBhFromCookie,
          }),
          Accept: "application/pdf",
        },
      });

      // Log debug info for Safari fallback
      console.log("🍎 Safari Fallback Debug:");
      console.log(
        "  X-Dbg-Upstream-Status:",
        response.headers.get("X-Dbg-Upstream-Status"),
      );
      console.log("  X-Dbg-Bytes:", response.headers.get("X-Dbg-Bytes"));

      if (response.status === 401) {
        newWindow.close();
        throw new Error("UNAUTHORIZED_401");
      }

      if (!response.ok) {
        newWindow.close();
        throw new Error(`PDF_FAILED_${response.status}`);
      }

      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);

      newWindow.location.href = blobUrl;

      // Clean up after delay
      setTimeout(() => {
        URL.revokeObjectURL(blobUrl);
      }, 60000);
    }
  } catch (error) {
    // Close the tab if we encounter an error
    newWindow.close();
    throw error;
  }
}

/**
 * Main PDF viewing function that automatically chooses the best approach
 * @param idsEncoded - URL-encoded comma-separated IDs
 * @param idToken - JWT token for authentication
 * @param useSafariFallback - Use Safari/iOS compatible approach (default: false)
 * @param wBh - Optional w-bh cookie value for enhanced compatibility
 */
export async function openPdfInNewTab(
  idsEncoded: string,
  idToken: string,
  useSafariFallback = false,
  wBh?: string,
): Promise<void> {
  if (!idsEncoded) {
    throw new Error("No IDs provided");
  }

  if (!idToken) {
    throw new Error("No authentication token provided");
  }

  if (useSafariFallback) {
    return openPdfInNewTabSafariFallback(idsEncoded, idToken);
  }

  if (SAME_ORIGIN) {
    // Same-origin approach: set cookie and open direct URL
    setAuthCookie(idToken);
    openPdfInNewTabDirect(idsEncoded);
  } else {
    // Cross-origin approach: use hardened server proxy
    await openPdfInNewTabViaProxy(idsEncoded, idToken, wBh);
  }
}

/**
 * Utility to detect if we likely need Safari fallback
 * @returns true if Safari/iOS detected
 */
export function needsSafariFallback(): boolean {
  const userAgent = navigator.userAgent.toLowerCase();
  return (
    (userAgent.includes("safari") && !userAgent.includes("chrome")) ||
    userAgent.includes("iphone") ||
    userAgent.includes("ipad")
  );
}
