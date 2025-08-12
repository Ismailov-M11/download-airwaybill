/**
 * Utility functions for managing cookies, specifically for Fargo API authentication
 */

/**
 * Get a specific cookie value by name
 * @param name - Cookie name to retrieve
 * @returns Cookie value or null if not found
 */
export function getCookie(name: string): string | null {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) {
    return parts.pop()?.split(';').shift() || null;
  }
  return null;
}

/**
 * Extract w-bh cookie value from browser cookies
 * This cookie is typically set when user visits admin.fargo.uz
 * @returns w-bh cookie value or null if not found
 */
export function getWBhCookie(): string | null {
  return getCookie('w-bh');
}

/**
 * Store w-bh cookie value in localStorage for cross-origin use
 * @param wBhValue - The w-bh cookie value to store
 */
export function storeWBhToken(wBhValue: string): void {
  if (wBhValue) {
    localStorage.setItem('w_bh_token', wBhValue);
  }
}

/**
 * Get stored w-bh token from localStorage
 * @returns Stored w-bh token or null
 */
export function getStoredWBhToken(): string | null {
  return localStorage.getItem('w_bh_token');
}

/**
 * Try to get w-bh token from browser cookies or localStorage
 * @returns w-bh token value or null
 */
export function getWBhToken(): string | null {
  // First try to get from browser cookies (same-origin)
  const cookieValue = getWBhCookie();
  if (cookieValue) {
    // Store it for future use
    storeWBhToken(cookieValue);
    return cookieValue;
  }
  
  // Fallback to localStorage (cross-origin)
  return getStoredWBhToken();
}

/**
 * Manual w-bh token setter for cases where user needs to provide it manually
 * @param wBhValue - The w-bh token value
 */
export function setWBhToken(wBhValue: string): void {
  storeWBhToken(wBhValue);
}
