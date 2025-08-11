import React, { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import {
  collectIdsPaged,
  normalizeOrderNumbers,
  getCacheStats,
  clearOrderCache,
} from "@/lib/orderSearch";
import ViewPdfButton from "@/components/ViewPdfButton";

const Dashboard: React.FC = () => {
  const { logout } = useAuth();

  // Application state
  const [orderNumbers, setOrderNumbers] = useState("");
  const [idToken, setIdToken] = useState<string>("");
  const [isSearching, setIsSearching] = useState(false);
  const [normalizedOrderNumbers, setNormalizedOrderNumbers] = useState<
    string[]
  >([]);
  const [foundIds, setFoundIds] = useState<number[]>([]);
  const [notFoundOrders, setNotFoundOrders] = useState<string[]>([]);
  const [idsEncoded, setIdsEncoded] = useState<string>("");
  const [logs, setLogs] = useState<string[]>([]);
  const [error, setError] = useState("");

  // Airwaybill functions
  const addLog = (message: string) => {
    setLogs((prev) => [
      ...prev,
      `${new Date().toLocaleTimeString()}: ${message}`,
    ]);
  };

  const clearLogs = () => {
    setLogs([]);
    setError("");
    setFoundIds([]);
    setNotFoundOrders([]);
    setIdsEncoded("");
  };

  // Event handlers
  const handleSearchOrders = async () => {
    if (!idToken) {
      setError("Authorization token not found");
      return;
    }

    if (!orderNumbers.trim()) {
      setError("Enter order numbers");
      return;
    }

    setIsSearching(true);
    setError("");

    try {
      const normalized = normalizeOrderNumbers(orderNumbers);
      setNormalizedOrderNumbers(normalized);

      addLog(`Order numbers entered: ${normalized.length}`);
      addLog("Starting order search...");

      const results = await collectIdsPaged(orderNumbers, idToken, {
        batchSize: 450,
        concurrency: 6,
      });

      setFoundIds(results.ids);
      setNotFoundOrders(results.notFound);
      setIdsEncoded(results.idsEncoded);

      addLog(
        `Search completed: found ${results.ids.length} IDs from ${normalized.length} numbers`,
      );
      addLog(`Encoded IDs: ${results.idsEncoded}`);

      if (results.notFound.length > 0) {
        addLog(
          `Numbers not found (${results.notFound.length}): ${results.notFound.join(", ")}`,
        );
      }
    } catch (error) {
      if (error instanceof Error && error.message === "UNAUTHORIZED_401") {
        addLog("Session expired, re-authentication required");
        logout();
        return;
      }

      if (error instanceof Error && error.message === "URI_TOO_LONG_414") {
        addLog(
          "Too many numbers in one request, try splitting into smaller parts",
        );
        setError("Number list too long - split into parts");
        return;
      }

      const message =
        error instanceof Error ? error.message : "Order search error";
      setError(message);
      addLog(`Error: ${message}`);
    } finally {
      setIsSearching(false);
    }
  };

  // Load token from localStorage on component mount
  React.useEffect(() => {
    const savedToken = localStorage.getItem("shipox_token");
    if (savedToken) {
      setIdToken(savedToken);
    }
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-sm border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-purple-600 rounded-lg flex items-center justify-center">
                <svg
                  className="w-5 h-5 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
              </div>
              <h1 className="text-xl font-semibold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                PDF Airwaybill Download
              </h1>
            </div>
            <Button
              onClick={logout}
              variant="outline"
              className="border-gray-300 hover:bg-gray-50"
            >
              Logout
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto p-6">
        {/* Header Card */}
        <Card className="shadow-xl border-0 bg-white/95 backdrop-blur-sm mb-6">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              Airwaybill System
            </CardTitle>
            <CardDescription>
              Search orders through Shipox API with optimization and caching,
              download PDF airwaybills from admin.fargo.uz
            </CardDescription>
          </CardHeader>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Column - Controls */}
          <div className="space-y-6">
            {/* Order Search */}
            <Card className="shadow-lg border-0 bg-white/95 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="text-lg">Order Search</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="order-numbers">Order Numbers</Label>
                  <Textarea
                    id="order-numbers"
                    value={orderNumbers}
                    onChange={(e) => setOrderNumbers(e.target.value)}
                    placeholder="Enter order numbers (separated by commas, spaces, or new lines)..."
                    className="min-h-[120px] resize-none"
                    disabled={isSearching}
                  />
                </div>
                {normalizedOrderNumbers.length > 0 && (
                  <div className="text-sm text-gray-600">
                    Numbers recognized: {normalizedOrderNumbers.length}
                  </div>
                )}
                <div className="flex gap-2">
                  <Button
                    onClick={handleSearchOrders}
                    disabled={isSearching || !orderNumbers.trim()}
                    className="flex-1 bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-700 hover:to-blue-700"
                  >
                    {isSearching ? "Searching orders..." : "Find Orders"}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Download */}
            <Card className="shadow-lg border-0 bg-white/95 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="text-lg">Airwaybill Download</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {foundIds.length > 0 && (
                  <div className="text-sm text-green-600">
                    IDs found for download: {foundIds.length}
                  </div>
                )}
                {notFoundOrders.length > 0 && (
                  <div className="text-sm text-red-600">
                    Not found: {notFoundOrders.length} numbers
                  </div>
                )}
                <ViewPdfButton
                  idsEncoded={idsEncoded}
                  idToken={idToken}
                  disabled={foundIds.length === 0}
                  className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
                  onError={(error) => {
                    setError(error);
                    addLog(`❌ PDF Error: ${error}`);
                  }}
                  onSuccess={() => {
                    addLog(
                      `✅ PDF opened successfully with ${foundIds.length} orders`,
                    );
                  }}
                >
                  Download
                </ViewPdfButton>
              </CardContent>
            </Card>
          </div>

          {/* Right Column - Status & Logs */}
          <div className="space-y-6">
            {/* Status Summary */}
            {(normalizedOrderNumbers.length > 0 ||
              foundIds.length > 0 ||
              notFoundOrders.length > 0) && (
              <Card className="shadow-lg border-0 bg-white/95 backdrop-blur-sm">
                <CardHeader>
                  <CardTitle className="text-lg">Status</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  {normalizedOrderNumbers.length > 0 && (
                    <div>
                      Order numbers entered:{" "}
                      <span className="font-semibold">
                        {normalizedOrderNumbers.length}
                      </span>
                    </div>
                  )}
                  {foundIds.length > 0 && (
                    <div className="text-green-600">
                      IDs found:{" "}
                      <span className="font-semibold">{foundIds.length}</span>
                    </div>
                  )}
                  {notFoundOrders.length > 0 && (
                    <div className="text-red-600">
                      Not found:{" "}
                      <span className="font-semibold">
                        {notFoundOrders.length}
                      </span>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Error Display */}
            {error && (
              <Alert className="border-red-200 bg-red-50">
                <AlertDescription className="text-red-700">
                  {error}
                </AlertDescription>
              </Alert>
            )}

            {/* Logs */}
            <Card className="shadow-lg border-0 bg-white/95 backdrop-blur-sm">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-lg">Logs</CardTitle>
                <div className="flex gap-2">
                  <Button
                    onClick={() => {
                      clearOrderCache();
                      addLog("Order cache cleared");
                    }}
                    variant="outline"
                    size="sm"
                  >
                    Clear Cache
                  </Button>
                  <Button
                    onClick={clearLogs}
                    variant="outline"
                    size="sm"
                    disabled={logs.length === 0}
                  >
                    Clear
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="bg-gray-50 rounded-lg p-3 max-h-64 overflow-y-auto">
                  {logs.length === 0 ? (
                    <div className="text-gray-500 text-sm text-center">
                      Logs will appear here
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {logs.map((log, index) => (
                        <div
                          key={index}
                          className="text-xs font-mono text-gray-700"
                        >
                          {log}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
