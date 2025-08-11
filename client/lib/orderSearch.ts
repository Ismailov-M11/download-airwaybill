/**
 * Simple and reliable order search module for Shipox API
 * Clean implementation focused on correct filtering and ID extraction
 */

// Types for order items
type OrderItem = {
  id: number | string;
  order_number?: string | number;
  locations?: any[];
};

// Result type
export interface SearchResult {
  ids: number[];
  idsEncoded: string;
  notFound: string[];
}

/**
 * Normalize order numbers input: split, trim, deduplicate, preserve order
 * Keep as strings to preserve leading zeros
 */
export function normalizeOrderNumbers(input: string): string[] {
  if (!input.trim()) return [];
  
  // Split by commas, spaces, newlines, tabs
  const numbers = input
    .split(/[,\s]+/)
    .map(s => s.trim())
    .filter(Boolean); // Remove empty strings
  
  // Remove duplicates while preserving order
  return Array.from(new Set(numbers));
}

/**
 * Search and extract IDs from Shipox API (single page request)
 * Main function that handles the complete search process
 */
export async function searchAndExtractIdsOnce(
  orderNumbersInput: string,
  token: string
): Promise<SearchResult> {
  
  // Step 1: Normalize input
  const orderNumbers = normalizeOrderNumbers(orderNumbersInput);
  
  if (orderNumbers.length === 0) {
    return {
      ids: [],
      idsEncoded: '',
      notFound: [],
    };
  }

  console.log(`🔍 Searching for ${orderNumbers.length} order numbers`);

  // Step 2: Build HTTP request
  const API_URL = "https://api-gateway.shipox.com/api/v2/admin/orders";
  
  // Use URLSearchParams to properly encode commas as %2C
  const params = new URLSearchParams({
    size: "500",
    page: "0", // TODO: pagination (page=1..N, пока collected < total)
    search: orderNumbers.join(","), // CSV from order_number
    search_type: "order_number",
    use_solr: "true"
  });

  const url = `${API_URL}?${params.toString()}`;

  // Step 3: Make HTTP request
  const response = await fetch(url, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${token}`,
      "accept": "application/json",
      "marketplace_id": "307345429"
    }
  });

  // Step 4: Handle response codes
  if (response.status === 401) {
    throw new Error("UNAUTHORIZED_401");
  }
  
  if (!response.ok) {
    throw new Error(`SEARCH_FAILED_${response.status}`);
  }

  const data = await response.json();

  // Step 5: Extract list from response
  const list = data?.data?.list ?? data?.list ?? [];
  
  console.log(`📦 Raw response: ${list.length} orders total`);

  // Step 6: Filter elements like in Postman
  const requestedSet = new Set(orderNumbers.map(n => String(n)));
  
  const filtered = (list as OrderItem[]).filter(item => {
    // Must have locations (array, even empty [] is ok)
    if (!Array.isArray(item.locations)) return false;
    
    // Must have order_number
    if (item.order_number === undefined) return false;
    
    // Must be one of the requested numbers
    if (!requestedSet.has(String(item.order_number))) return false;
    
    return true;
  });

  console.log(`✅ After filtering: ${filtered.length} orders match criteria`);

  // Step 7: Extract IDs
  const ids = Array.from(new Set(
    filtered
      .map(item => Number(item.id))
      .filter(n => Number.isFinite(n)) // Remove invalid numbers
  ));

  // Step 8: Build result
  const foundNumbers = new Set(filtered.map(item => String(item.order_number)));
  const notFound = orderNumbers.filter(num => !foundNumbers.has(String(num)));

  // Step 9: Create encoded string for PDF (strictly no spaces, %2C separator)
  const idsEncoded = ids.map(String).join('%2C');

  console.log(`🎯 Results: ${ids.length} unique IDs found, ${notFound.length} not found`);
  console.log(`📋 Encoded IDs: ${idsEncoded}`);
  
  if (notFound.length > 0) {
    console.log(`❌ Not found:`, notFound.slice(0, 5), notFound.length > 5 ? `... and ${notFound.length - 5} more` : '');
  }

  return {
    ids,
    idsEncoded,
    notFound,
  };
}

/**
 * Utility functions for cache management (kept for compatibility)
 */
export function clearOrderCache(): void {
  try {
    localStorage.removeItem('order_to_id_cache');
    console.log('🗑️ Order cache cleared');
  } catch (error) {
    console.warn('Failed to clear order cache:', error);
  }
}

export function getCacheStats(): { entries: number; size: string } {
  try {
    const cached = localStorage.getItem('order_to_id_cache');
    if (!cached) {
      return { entries: 0, size: '0 KB' };
    }
    
    const cache = JSON.parse(cached);
    const entries = Object.keys(cache).length;
    const sizeKB = Math.round((cached.length * 2) / 1024);
    
    return {
      entries,
      size: `${sizeKB} KB`,
    };
  } catch (error) {
    return { entries: 0, size: 'Error' };
  }
}

// Keep old function name for compatibility
export const collectIdsFast = searchAndExtractIdsOnce;
export const searchOnceAndExtract = searchAndExtractIdsOnce;
