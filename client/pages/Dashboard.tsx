import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { searchAndExtractIdsOnce, normalizeOrderNumbers, getCacheStats, clearOrderCache } from '@/lib/orderSearch';

const Dashboard: React.FC = () => {
  const { logout } = useAuth();

  // Application state
  const [orderNumbers, setOrderNumbers] = useState('');
  const [idToken, setIdToken] = useState<string>('');
  const [isSearching, setIsSearching] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [normalizedOrderNumbers, setNormalizedOrderNumbers] = useState<string[]>([]);
  const [foundIds, setFoundIds] = useState<number[]>([]);
  const [notFoundOrders, setNotFoundOrders] = useState<string[]>([]);
  const [idsEncoded, setIdsEncoded] = useState<string>('');
  const [logs, setLogs] = useState<string[]>([]);
  const [error, setError] = useState('');

  // Airwaybill functions
  const addLog = (message: string) => {
    setLogs(prev => [...prev, `${new Date().toLocaleTimeString()}: ${message}`]);
  };

  const clearLogs = () => {
    setLogs([]);
    setError('');
    setFoundIds([]);
    setNotFoundOrders([]);
    setIdsEncoded('');
  };




  const setAuthCookie = (token: string): void => {
    document.cookie = `w-jwt=${token}; path=/; secure; samesite=lax`;
  };

  const downloadPdf = async (idsStr: string, filename: string): Promise<void> => {
    const url = `https://admin.fargo.uz/file/order/airwaybill_mini?ids=${idsStr}`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/pdf',
      },
      credentials: 'include',
    });

    if (response.status === 401) {
      throw new Error('401');
    }

    if (!response.ok) {
      throw new Error(`Ошибка скачивания: ${response.status} ${response.statusText}`);
    }

    const blob = await response.blob();
    
    const downloadUrl = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(downloadUrl);
  };

  // Event handlers
  const handleSearchOrders = async () => {
    if (!idToken) {
      setError('Токен авторизации не найден');
      return;
    }

    if (!orderNumbers.trim()) {
      setError('Введите номера заказов');
      return;
    }

    setIsSearching(true);
    setError('');
    
    try {
      const normalized = normalizeOrderNumbers(orderNumbers);
      setNormalizedOrderNumbers(normalized);

      addLog(`В��едено номеров зака��ов: ${normalized.length}`);
      addLog('Начинается поиск заказов...');

      const results = await searchAndExtractIdsOnce(orderNumbers, idToken);

      setFoundIds(results.ids);
      setNotFoundOrders(results.notFound);
      setIdsEncoded(results.idsEncoded);

      addLog(`Поиск завершен: найдено ${results.ids.length} ID из ${normalized.length} номеров`);
      addLog(`Закодированные ID: ${results.idsEncoded}`);

      if (results.notFound.length > 0) {
        addLog(`Не найдены номера (${results.notFound.length}): ${results.notFound.join(', ')}`);
      }
      
    } catch (error) {
      if (error instanceof Error && error.message === 'UNAUTHORIZED_401') {
        addLog('Сессия истекла, требуется повторная авторизация');
        logout();
        return;
      }

      if (error instanceof Error && error.message === 'URI_TOO_LONG_414') {
        addLog('Слишком много номеров в одном запросе, попробуйте разбить на меньшие части');
        setError('Слишком длинный список номеров - разбейте на части');
        return;
      }

      const message = error instanceof Error ? error.message : 'Ошибка поиска заказов';
      setError(message);
      addLog(`Ошибка: ${message}`);
    } finally {
      setIsSearching(false);
    }
  };

  const handleDownloadPdf = async () => {
    if (foundIds.length === 0 || !idsEncoded) {
      setError('Сначала найдите заказы');
      return;
    }

    setIsDownloading(true);
    setError('');

    try {
      addLog('Установка cookie для авторизации...');
      setAuthCookie(idToken);

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const filename = `airwaybill_${timestamp}.pdf`;

      addLog(`Скачивание PDF с ${foundIds.length} заказами...`);

      await downloadPdf(idsEncoded, filename);
      
      addLog(`PDF файл "${filename}" успешн�� скачан`);
      
    } catch (error) {
      if (error instanceof Error && error.message === '401') {
        addLog('Сессия истекла, требу��тся повто��ная авторизация');
        const message = 'Сессия истекла, войдите снова';
        setError(message);
        addLog(`Ошибка: ${message}`);
        logout();
      } else {
        const message = error instanceof Error ? error.message : 'Ош��бка скачивания PDF';
        setError(message);
        addLog(`Ошибка: ${message}`);
      }
    } finally {
      setIsDownloading(false);
    }
  };

  // Load token from localStorage on component mount
  React.useEffect(() => {
    const savedToken = localStorage.getItem('shipox_token');
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
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <h1 className="text-xl font-semibold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                Скачивание PDF Авианакладных
              </h1>
            </div>
            <Button
              onClick={logout}
              variant="outline"
              className="border-gray-300 hover:bg-gray-50"
            >
              Выйти
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
              Система Авианакладных
            </CardTitle>
            <CardDescription>
              Поиск заказов через Shipox API с оптимизацией и кэшированием, скачивание PDF авианакладных с admin.fargo.uz
            </CardDescription>
          </CardHeader>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Column - Controls */}
          <div className="space-y-6">
            {/* Order Search */}
            <Card className="shadow-lg border-0 bg-white/95 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="text-lg">Поиск заказов</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="order-numbers">Номера заказов</Label>
                  <Textarea
                    id="order-numbers"
                    value={orderNumbers}
                    onChange={(e) => setOrderNumbers(e.target.value)}
                    placeholder="Введите номера з��казов (через запятые, пробелы или новые с��роки)..."
                    className="min-h-[120px] resize-none"
                    disabled={isSearching}
                  />
                </div>
                {normalizedOrderNumbers.length > 0 && (
                  <div className="text-sm text-gray-600">
                    Распознано номеров: {normalizedOrderNumbers.length}
                  </div>
                )}
                <div className="flex gap-2">
                  <Button
                    onClick={handleSearchOrders}
                    disabled={isSearching || !orderNumbers.trim()}
                    className="flex-1 bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-700 hover:to-blue-700"
                  >
                    {isSearching ? 'Поиск заказов...' : 'Найти заказы'}
                  </Button>
                  <Button
                    onClick={async () => {
                      if (!idToken || !orderNumbers.trim()) return;

                      setIsSearching(true);
                      setError('');
                      try {
                        addLog('🧪 Тестовый запрос (один запрос без кэша)...');
                        const result = await searchOnceAndExtract(orderNumbers, idToken);
                        addLog(`��ест: найдено ${result.ids.length} ID, не найдено ${result.notFound.length}`);
                        addLog(`Encoded: ${result.idsEncoded}`);
                      } catch (error) {
                        const msg = error instanceof Error ? error.message : 'Ошибка теста';
                        addLog(`Ошибка теста: ${msg}`);
                      } finally {
                        setIsSearching(false);
                      }
                    }}
                    disabled={isSearching || !orderNumbers.trim()}
                    variant="outline"
                    size="sm"
                  >
                    Тест
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Download */}
            <Card className="shadow-lg border-0 bg-white/95 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="text-lg">Скачивание авианакладных</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {foundIds.length > 0 && (
                  <div className="text-sm text-green-600">
                    Найдено ID для скачивания: {foundIds.length}
                  </div>
                )}
                {notFoundOrders.length > 0 && (
                  <div className="text-sm text-red-600">
                    Не найдено: {notFoundOrders.length} номеров
                  </div>
                )}
                <Button
                  onClick={handleDownloadPdf}
                  disabled={isDownloading || foundIds.length === 0}
                  className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
                >
                  {isDownloading ? 'Скачивание PDF...' : 'Скачать авианакладные'}
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Right Column - Status & Logs */}
          <div className="space-y-6">
            {/* Progress */}
            {isDownloading && (
              <Card className="shadow-lg border-0 bg-white/95 backdrop-blur-sm">
                <CardHeader>
                  <CardTitle className="text-lg">Прогресс</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-center">
                    <div className="animate-spin w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full mx-auto mb-2"></div>
                    <div className="text-sm">Скачива��ие авианакладных...</div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Status Summary */}
            {(normalizedOrderNumbers.length > 0 || foundIds.length > 0 || notFoundOrders.length > 0) && (
              <Card className="shadow-lg border-0 bg-white/95 backdrop-blur-sm">
                <CardHeader>
                  <CardTitle className="text-lg">Статус</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  {normalizedOrderNumbers.length > 0 && (
                    <div>Вве��ено номеров заказов: <span className="font-semibold">{normalizedOrderNumbers.length}</span></div>
                  )}
                  {foundIds.length > 0 && (
                    <div className="text-green-600">Найдено ID: <span className="font-semibold">{foundIds.length}</span></div>
                  )}
                  {notFoundOrders.length > 0 && (
                    <div className="text-red-600">Не найдено: <span className="font-semibold">{notFoundOrders.length}</span></div>
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
                <CardTitle className="text-lg">Логи</CardTitle>
                <div className="flex gap-2">
                  <Button
                    onClick={() => {
                      clearOrderCache();
                      addLog('Кэш заказов очищен');
                    }}
                    variant="outline"
                    size="sm"
                  >
                    Очистить кэш
                  </Button>
                  <Button
                    onClick={clearLogs}
                    variant="outline"
                    size="sm"
                    disabled={logs.length === 0}
                  >
                    Очистить
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="bg-gray-50 rounded-lg p-3 max-h-64 overflow-y-auto">
                  {logs.length === 0 ? (
                    <div className="text-gray-500 text-sm text-center">Логи появятся здесь</div>
                  ) : (
                    <div className="space-y-1">
                      {logs.map((log, index) => (
                        <div key={index} className="text-xs font-mono text-gray-700">
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
