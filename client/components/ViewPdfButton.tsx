import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  openPdfInNewTab,
  needsSafariFallback,
  SAME_ORIGIN,
} from "@/lib/pdfViewer";

export type ViewPdfButtonProps = {
  idsEncoded: string;
  idToken: string;
  wBh?: string; // w-bh cookie value for Fargo API
  sameOrigin?: boolean; // Override global SAME_ORIGIN setting if needed
  className?: string;
  disabled?: boolean;
  children?: React.ReactNode; // Allow custom button text
  onError?: (error: string) => void; // Callback for error handling
  onSuccess?: () => void; // Callback for successful PDF opening
};

/**
 * Reusable PDF viewing button component
 * Automatically chooses the best approach based on environment and browser
 */
export default function ViewPdfButton({
  idsEncoded,
  idToken,
  wBh,
  sameOrigin = SAME_ORIGIN,
  className,
  disabled = false,
  children = "Download",
  onError,
  onSuccess,
}: ViewPdfButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onClick = async () => {
    // Clear previous errors
    setError(null);

    // Validate inputs
    if (!idsEncoded) {
      const errorMsg = "No IDs provided.";
      setError(errorMsg);
      onError?.(errorMsg);
      return;
    }

    if (!idToken) {
      const errorMsg = "No authentication token provided.";
      setError(errorMsg);
      onError?.(errorMsg);
      return;
    }

    try {
      setLoading(true);

      // Detect if we need Safari fallback
      const useSafariFallback = needsSafariFallback();

      if (useSafariFallback) {
        console.log("🍎 Using Safari/iOS fallback approach");
      }

      console.log(
        `📄 Opening PDF with ${idsEncoded.split("%2C").length} orders (${sameOrigin ? "same-origin" : "cross-origin"} mode)`,
      );

      // Open PDF using the hardened proxy with debug headers
      // Pass wBh token for proper Fargo API authentication
      await openPdfInNewTab(idsEncoded, idToken, useSafariFallback, wBh);

      // Success callback
      console.log("✅ PDF opened successfully");
      onSuccess?.();
    } catch (e: any) {
      let errorMessage = "Failed to open PDF";

      // Handle specific error types
      if (e?.message === "UNAUTHORIZED_401") {
        errorMessage = "Session expired - please log in again";
      } else if (e?.message?.startsWith("PDF_FAILED_")) {
        const status = e.message.replace("PDF_FAILED_", "");
        if (status === "200") {
          errorMessage = "PDF is empty - authentication cookies may be missing. Try logging out and back in.";
        } else {
          errorMessage = `PDF generation failed (${status}) - check DevTools Network tab for X-Dbg-* headers`;
        }
      } else if (e?.message?.includes("popup blocked")) {
        errorMessage = "Popup blocked - please allow popups for this site";
      } else if (e?.message) {
        errorMessage = e.message;
      }

      console.error("❌ PDF viewing error:", e);
      console.log(
        "💡 Debug tip: Check DevTools → Network → /api/pdf request → Response Headers for X-Dbg-* debug info",
      );
      setError(errorMessage);
      onError?.(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-2">
      <Button
        onClick={onClick}
        disabled={loading || disabled || !idsEncoded || !idToken}
        className={className}
      >
        {loading ? "Opening…" : children}
      </Button>

      {error && <div className="text-sm text-red-600 text-center">{error}</div>}

      {/* Debug info in development */}
      {process.env.NODE_ENV === "development" && (
        <div className="text-xs text-gray-500 text-center">
          Mode: {sameOrigin ? "same-origin" : "cross-origin (hardened proxy)"} |
          IDs: {idsEncoded ? idsEncoded.split("%2C").length : 0} | Safari:{" "}
          {needsSafariFallback() ? "yes" : "no"}
          <br />
          💡 Check DevTools Network tab for X-Dbg-* debug headers
        </div>
      )}
    </div>
  );
}

/**
 * Simplified version for basic use cases
 */
export function SimplePdfButton({
  idsEncoded,
  idToken,
  wBh,
  className = "w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700",
  disabled = false,
}: Pick<
  ViewPdfButtonProps,
  "idsEncoded" | "idToken" | "wBh" | "className" | "disabled"
>) {
  return (
    <ViewPdfButton
      idsEncoded={idsEncoded}
      idToken={idToken}
      wBh={wBh}
      className={className}
      disabled={disabled}
    />
  );
}
