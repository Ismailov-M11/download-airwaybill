/**
 * Utility module for extracting and processing order IDs from API responses
 * Handles JSON responses from the 2nd API and prepares data for PDF requests
 */

/**
 * Removes duplicates from array while preserving original order
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
 * Extracts order IDs from API response and creates encoded string for PDF requests
 * @param respJson - JSON response from API (can be { data: { list } } or { list })
 * @returns Object with ids array and encoded string for URL
 */
export function extractIdsEncodedFromResponse(respJson: any): {
  ids: number[];
  idsEncoded: string;
} {
  // Handle empty or invalid response
  if (!respJson || typeof respJson !== "object") {
    return { ids: [], idsEncoded: "" };
  }

  // Extract list from response - handle both response formats
  let list: any[] = [];
  if (respJson.data && Array.isArray(respJson.data.list)) {
    list = respJson.data.list;
  } else if (Array.isArray(respJson.list)) {
    list = respJson.list;
  } else {
    // No valid list found
    return { ids: [], idsEncoded: "" };
  }

  // Extract IDs from list items
  const rawIds: any[] = list
    .map((item) => item?.id) // Get id field from each item
    .filter((id) => id !== undefined && id !== null); // Filter out missing IDs

  // Convert to numbers and filter out non-numeric values
  const numericIds: number[] = rawIds
    .map((id) => {
      const parsed = typeof id === "string" ? parseInt(id, 10) : Number(id);
      return isNaN(parsed) ? null : parsed;
    })
    .filter((id): id is number => id !== null); // Type guard to filter nulls

  // Remove duplicates while preserving order
  const uniqueIds = dedupePreserveOrder(numericIds);

  // Create encoded string for URL (strictly no spaces, %2C for comma)
  const idsEncoded = uniqueIds.map(String).join("%2C");

  return {
    ids: uniqueIds,
    idsEncoded,
  };
}

// Usage example:
// const json = await fetch(...).then(r => r.json());
// const { ids, idsEncoded } = extractIdsEncodedFromResponse(json);
// console.log(ids);        // [2517009510, 2517009266, ...]
// console.log(idsEncoded); // "2517009510%2C2517009266%2C..."
