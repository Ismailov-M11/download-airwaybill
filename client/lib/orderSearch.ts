/**
 * Comprehensive order search module for Shipox API
 * Handles large inputs with pagination, batching, and controlled concurrency
 */

// Debug flag for development logging
const DEBUG = false;

// Types for order items
type OrderItem = {
  id: number | string;
  order_number?: string | number;
  locations?: any[];
};

// API response structure
type SearchResponse = {
  data?: {
    list: OrderItem[];
    total?: number;
  };
  list?: OrderItem[];
  total?: number;
};

// Result type
export interface SearchResult {
  ids: number[];
  idsEncoded: string;
  notFound: string[];
}

// Configuration options for collectIdsPaged
export interface SearchOptions {
  batchSize?: number;
  concurrency?: number;
}

/**
 * Generic dedupe that preserves array order using Set
 * @param arr - Array of any type
 * @returns Array with duplicates removed, maintaining original order
 */
export function dedupePreserveOrder<T>(arr: T[]): T[] {
  const seen = new Set<T>();
  const result: T[] = [];
  
  for (const item of arr) {
    if (!seen.has(item)) {
      seen.add(item);
      result.push(item);
    }
  }
  
  return result;
}

/**
 * Normalize order numbers input: split, trim, deduplicate, preserve order
 * Keep as strings to preserve leading zeros and treat numbers as strings
 * @param input - Raw textarea input with order numbers
 * @returns Array of normalized order number strings
 */
export function normalizeOrderNumbers(input: string): string[] {
  if (!input.trim()) return [];
  
  // Split by commas, whitespace, or newlines
  const numbers = input
    .split(/[,\s]+/)
    .map(s => s.trim())
    .filter(Boolean); // Remove empty strings
  
  // Remove duplicates while preserving original order
  return dedupePreserveOrder(numbers);
}

/**
 * Search single batch with pagination support
 * @param orderNumbers - Array of order numbers for this batch
 * @param token - Authorization token
 * @returns Promise with collected results from all pages
 */
async function searchBatchWithPagination(
  orderNumbers: string[],
  token: string
): Promise<{ items: OrderItem[]; requestedSet: Set<string> }> {
  const API_URL = "https://api-gateway.shipox.com/api/v2/admin/orders";
  const requestedSet = new Set(orderNumbers.map(n => String(n)));
  let allItems: OrderItem[] = [];
  let page = 0;
  let totalCollected = 0;
  let apiTotal: number | undefined;

  if (DEBUG) {
    console.log(`🔍 Starting batch search for ${orderNumbers.length} order numbers`);
  }

  // Create abort controller with 30s timeout per page
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  try {
    while (true) {
      // Build query parameters
      const params = new URLSearchParams({
        size: String(Math.min(orderNumbers.length, 500)),
        page: String(page),
        search: orderNumbers.join(","), // CSV - URLSearchParams will encode commas as %2C
        search_type: "order_number",
        use_solr: "true"
      });

      const url = `${API_URL}?${params.toString()}`;

      if (DEBUG) {
        console.log(`📄 Fetching page ${page} for batch...`);
      }

      // Make HTTP request
      const response = await fetch(url, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${token}`,
          "accept": "application/json",
          "marketplace_id": "307345429"
        },
        signal: controller.signal
      });

      // Handle response codes
      if (response.status === 401) {
        throw new Error("UNAUTHORIZED_401");
      }
      
      if (!response.ok) {
        throw new Error(`SEARCH_FAILED_${response.status}`);
      }

      const data: SearchResponse = await response.json();

      // Extract list and total from response (handle both formats)
      const list = data?.data?.list ?? data?.list ?? [];
      const total = data?.data?.total ?? data?.total;

      if (apiTotal === undefined && total !== undefined) {
        apiTotal = total;
      }

      if (DEBUG) {
        console.log(`📦 Page ${page}: ${list.length} items, total: ${total}, collected: ${totalCollected}`);
      }

      // Add items to collection
      allItems = allItems.concat(list);
      totalCollected += list.length;

      // Stop conditions:
      // 1. Empty page (no more results)
      // 2. We've collected >= total (if available)
      // 3. Current page returned less than requested size (last page)
      if (list.length === 0) {
        if (DEBUG) console.log(`✅ Stopping: empty page`);
        break;
      }

      if (apiTotal !== undefined && totalCollected >= apiTotal) {
        if (DEBUG) console.log(`✅ Stopping: collected ${totalCollected} >= total ${apiTotal}`);
        break;
      }

      if (list.length < Math.min(orderNumbers.length, 500)) {
        if (DEBUG) console.log(`✅ Stopping: partial page (${list.length} < ${Math.min(orderNumbers.length, 500)})`);
        break;
      }

      page++;
    }
  } finally {
    clearTimeout(timeoutId);
  }

  if (DEBUG) {
    console.log(`🎯 Batch complete: ${allItems.length} total items collected`);
  }

  return { items: allItems, requestedSet };
}

/**
 * Process batch results: filter, extract IDs, compute not found
 * @param items - All collected items from API
 * @param requestedSet - Set of requested order numbers
 * @returns Processed results
 */
function processBatchResults(
  items: OrderItem[],
  requestedSet: Set<string>
): { ids: number[]; notFoundForBatch: string[] } {
  
  // Filter elements like in existing logic
  const filtered = items.filter(item => {
    // Must have locations (array, even empty [] is ok)
    if (!Array.isArray(item.locations)) return false;
    
    // Must have order_number
    if (item.order_number === undefined) return false;
    
    // Must be one of the requested numbers
    if (!requestedSet.has(String(item.order_number))) return false;
    
    return true;
  });

  if (DEBUG) {
    console.log(`✅ After filtering: ${filtered.length} orders match criteria`);
  }

  // Extract IDs (convert to number, filter invalid)
  const ids = filtered
    .map(item => Number(item.id))
    .filter(n => Number.isFinite(n));

  // Compute not found for this batch
  const foundNumbers = new Set(filtered.map(item => String(item.order_number)));
  const notFoundForBatch = Array.from(requestedSet).filter(num => !foundNumbers.has(num));

  return { ids, notFoundForBatch };
}

/**
 * Main function: search with pagination, batching, and controlled concurrency
 * @param rawInput - Raw textarea input with order numbers
 * @param token - Authorization token
 * @param opts - Options for batch size and concurrency
 * @returns Promise with comprehensive search results
 */
export async function collectIdsPaged(
  rawInput: string,
  token: string,
  opts: SearchOptions = {}
): Promise<SearchResult> {
  
  const { batchSize = 450, concurrency = 6 } = opts;

  // Step 1: Normalize input
  const orderNumbers = normalizeOrderNumbers(rawInput);
  
  if (orderNumbers.length === 0) {
    return {
      ids: [],
      idsEncoded: '',
      notFound: [],
    };
  }

  if (DEBUG) {
    console.log(`🚀 Starting collectIdsPaged for ${orderNumbers.length} order numbers`);
    console.log(`⚙️ Config: batchSize=${batchSize}, concurrency=${concurrency}`);
  }

  // Step 2: Split into batches to avoid URL length issues
  const batches: string[][] = [];
  for (let i = 0; i < orderNumbers.length; i += batchSize) {
    batches.push(orderNumbers.slice(i, i + batchSize));
  }

  if (DEBUG) {
    console.log(`📦 Split into ${batches.length} batches`);
  }

  // Step 3: Process batches with controlled concurrency
  let allIds: number[] = [];
  let allNotFound: string[] = [];

  // Process batches in chunks to control concurrency
  for (let i = 0; i < batches.length; i += concurrency) {
    const batchChunk = batches.slice(i, i + concurrency);
    
    if (DEBUG) {
      console.log(`🔄 Processing batch chunk ${Math.floor(i / concurrency) + 1}/${Math.ceil(batches.length / concurrency)}`);
    }

    // Process this chunk of batches in parallel
    const chunkPromises = batchChunk.map(async (batch) => {
      const { items, requestedSet } = await searchBatchWithPagination(batch, token);
      return processBatchResults(items, requestedSet);
    });

    const chunkResults = await Promise.all(chunkPromises);
    
    // Accumulate results
    for (const result of chunkResults) {
      allIds = allIds.concat(result.ids);
      allNotFound = allNotFound.concat(result.notFoundForBatch);
    }
  }

  // Step 4: Deduplicate IDs while preserving order
  const uniqueIds = dedupePreserveOrder(allIds);

  // Step 5: Create encoded string for PDF (strictly no spaces, %2C separator)
  const idsEncoded = uniqueIds.map(String).join('%2C');

  // Step 6: Deduplicate not found entries
  const uniqueNotFound = dedupePreserveOrder(allNotFound);

  if (DEBUG) {
    console.log(`🎯 Final results: ${uniqueIds.length} unique IDs found, ${uniqueNotFound.length} not found`);
    console.log(`📋 Encoded IDs: ${idsEncoded.substring(0, 100)}${idsEncoded.length > 100 ? '...' : ''}`);
  }

  return {
    ids: uniqueIds,
    idsEncoded,
    notFound: uniqueNotFound,
  };
}

/**
 * Legacy function: single-page search (for backward compatibility)
 * @deprecated Use collectIdsPaged for better reliability
 */
export async function searchAndExtractIdsOnce(
  orderNumbersInput: string,
  token: string
): Promise<SearchResult> {
  // Use the new function with single page (size 1 batch, page 0 only)
  return collectIdsPaged(orderNumbersInput, token, { batchSize: 500, concurrency: 1 });
}

/**
 * Utility functions for cache management (kept for compatibility)
 */
export function clearOrderCache(): void {
  try {
    localStorage.removeItem('order_to_id_cache');
    if (DEBUG) console.log('🗑️ Order cache cleared');
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

// Keep old function names for compatibility
export const collectIdsFast = collectIdsPaged;
export const searchOnceAndExtract = searchAndExtractIdsOnce;
