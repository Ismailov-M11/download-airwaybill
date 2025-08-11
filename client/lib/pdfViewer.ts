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
 * @param idsEncoded - URL-encoded comma-separated IDs
 * @param idToken - JWT token for authentication
 */
export async function openPdfInNewTabViaProxy(
  idsEncoded: string,
  idToken: string,
): Promise<void> {
  // Fetch PDF through our server proxy
  const response = await fetch(`/api/pdf?ids=${encodeURIComponent(idsEncoded)}`, {
    headers: {
      "X-Auth-Token": idToken,
      "Accept": "application/pdf",
    },
  });

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
      const response = await fetch(`/api/pdf?ids=${encodeURIComponent(idsEncoded)}`, {
        headers: {
          "X-Auth-Token": idToken,
          "Accept": "application/pdf",
        },
      });

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
 */
export async function openPdfInNewTab(
  idsEncoded: string,
  idToken: string,
  useSafariFallback = false,
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
    // Cross-origin approach: use server proxy
    await openPdfInNewTabViaProxy(idsEncoded, idToken);
  }
}

/**
 * Utility to detect if we likely need Safari fallback
 * @returns true if Safari/iOS detected
 */
export function needsSafariFallback(): boolean {
  const userAgent = navigator.userAgent.toLowerCase();
  return userAgent.includes('safari') && !userAgent.includes('chrome') ||
         userAgent.includes('iphone') || userAgent.includes('ipad');
}
