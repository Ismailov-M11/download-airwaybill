/**
 * Example usage of the order search module
 * Shows how to use the clean and simple API
 */

import React, { useState } from 'react';
import { searchAndExtractIdsOnce, normalizeOrderNumbers } from './orderSearch';

export function OrderSearchExample() {
  const [orderInput, setOrderInput] = useState('');
  const [token, setToken] = useState('');
  const [results, setResults] = useState<{
    ids: number[];
    idsEncoded: string;
    notFound: string[];
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSearch = async () => {
    if (!token || !orderInput.trim()) {
      setError('Please provide token and order numbers');
      return;
    }

    setLoading(true);
    setError('');
    setResults(null);

    try {
      // Call the main search function
      const result = await searchAndExtractIdsOnce(orderInput, token);
      setResults(result);
      
      console.log('Search completed:', {
        foundIds: result.ids.length,
        notFound: result.notFound.length,
        idsEncoded: result.idsEncoded
      });
      
    } catch (err) {
      if (err instanceof Error) {
        if (err.message === 'UNAUTHORIZED_401') {
          setError('Authentication failed - please login again');
        } else if (err.message.startsWith('SEARCH_FAILED_')) {
          setError(`Search failed: ${err.message}`);
        } else {
          setError(err.message);
        }
      } else {
        setError('Unknown error occurred');
      }
    } finally {
      setLoading(false);
    }
  };

  // Show normalized input preview
  const normalizedPreview = orderInput ? normalizeOrderNumbers(orderInput) : [];

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-4">
      <h2 className="text-xl font-bold">Order Search Example</h2>
      
      {/* Token input */}
      <div>
        <label className="block text-sm font-medium mb-1">
          Shipox API Token:
        </label>
        <input
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="Enter your Bearer token"
          className="w-full p-2 border rounded"
        />
      </div>

      {/* Order numbers input */}
      <div>
        <label className="block text-sm font-medium mb-1">
          Order Numbers (comma/space/newline separated):
        </label>
        <textarea
          value={orderInput}
          onChange={(e) => setOrderInput(e.target.value)}
          placeholder="Enter order numbers like: 12345, 67890&#10;11111&#10;22222"
          rows={4}
          className="w-full p-2 border rounded"
        />
        {normalizedPreview.length > 0 && (
          <div className="text-sm text-gray-600 mt-1">
            Normalized: {normalizedPreview.length} unique numbers
          </div>
        )}
      </div>

      {/* Search button */}
      <button
        onClick={handleSearch}
        disabled={loading || !token || !orderInput.trim()}
        className="w-full bg-blue-600 text-white p-2 rounded disabled:opacity-50"
      >
        {loading ? 'Searching...' : 'Search Orders'}
      </button>

      {/* Error display */}
      {error && (
        <div className="p-3 bg-red-100 border border-red-300 rounded text-red-700">
          Error: {error}
        </div>
      )}

      {/* Results display */}
      {results && (
        <div className="space-y-3">
          <h3 className="font-medium">Results:</h3>
          
          <div className="p-3 bg-green-100 border border-green-300 rounded">
            <p><strong>Found IDs:</strong> {results.ids.length}</p>
            <p><strong>IDs for PDF:</strong></p>
            <code className="block bg-white p-2 mt-1 rounded text-sm break-all">
              {results.idsEncoded || '(none)'}
            </code>
          </div>

          {results.notFound.length > 0 && (
            <div className="p-3 bg-yellow-100 border border-yellow-300 rounded">
              <p><strong>Not Found ({results.notFound.length}):</strong></p>
              <div className="text-sm mt-1">
                {results.notFound.join(', ')}
              </div>
            </div>
          )}

          <div className="text-xs text-gray-500">
            <p>Next step: Use idsEncoded in PDF generation API</p>
            <p>URL: https://admin.fargo.uz/file/order/airwaybill_mini?ids={results.idsEncoded}</p>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Simple function call example (for use in other components):
 */
export async function exampleUsage() {
  const orderNumbersFromTextarea = "12345, 67890\n11111\n22222";
  const bearerToken = "your-jwt-token-here";

  try {
    const result = await searchAndExtractIdsOnce(orderNumbersFromTextarea, bearerToken);
    
    console.log(`Found ${result.ids.length} orders`);
    console.log(`PDF URL: https://admin.fargo.uz/file/order/airwaybill_mini?ids=${result.idsEncoded}`);
    console.log(`Not found: ${result.notFound.join(', ')}`);
    
    return result;
    
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED_401') {
      // Handle re-authentication
      console.log('Need to login again');
    } else {
      console.error('Search failed:', error);
    }
    throw error;
  }
}
