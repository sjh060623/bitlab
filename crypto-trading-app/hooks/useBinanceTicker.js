import { useState, useEffect, useRef, useCallback } from 'react';
import { AppState } from 'react-native';

const normalizeTickerData = (data) => {
  const rawPrice =
    data?.c ||
    data?.lastPrice ||
    data?.p ||
    data?.price ||
    data?.a;
  const rawChange =
    data?.P ??
    data?.priceChangePercent ??
    data?.priceChange ??
    data?.change ??
    0;

  const price = parseFloat(rawPrice);
  const change = parseFloat(rawChange);

  if (!Number.isFinite(price) || price <= 0) {
    return null;
  }

  return {
    price,
    change: Number.isFinite(change) ? change : 0,
  };
};

export default function useBinanceTicker(symbol = 'BTCUSDT', type = 'SPOT') {
  const [ticker, setTicker] = useState({ price: 0, change: 0 });
  const ws = useRef(null);
  const reconnectTimer = useRef(null);
  const reconnectAttempts = useRef(0);
  const healthCheckTimer = useRef(null);
  const lastMessageAt = useRef(0);
  const messageCount = useRef(0);
  const isMounted = useRef(true);
  const appState = useRef(AppState.currentState);

  const connect = useCallback(() => {
    if (!symbol) return;

    if (reconnectTimer.current) {
      clearTimeout(reconnectTimer.current);
      reconnectTimer.current = null;
    }

    lastMessageAt.current = Date.now();

    if (ws.current) {
      ws.current.close();
      ws.current = null;
    }

    const fetchInitialPrice = async () => {
      try {
        const url =
          type === 'FUTURES'
            ? `https://fapi.binance.com/fapi/v1/ticker/24hr?symbol=${symbol}`
            : `https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}`;

        console.log('[useBinanceTicker] fetchInitialPrice', { symbol, type, url });

        const response = await fetch(url);
        const data = await response.json();
        console.log('[useBinanceTicker] fetchInitialPrice response', { symbol, type, data });

        const normalized = normalizeTickerData(data);

        if (normalized) {
          setTicker(prev => {
            if (
              ws.current &&
              ws.current.readyState === WebSocket.OPEN &&
              prev.price > 0
            ) {
              return prev;
            }
            return normalized;
          });
        }
      } catch (e) {
        console.log('[useBinanceTicker] fetchInitialPrice error', { symbol, type, error: e });
      }
    };

    fetchInitialPrice();

    const normalizedSymbol = symbol.toLowerCase();
    const wsUrl =
      type === 'FUTURES'
        ? `wss://fstream.binance.com/stream?streams=${normalizedSymbol}@ticker/${normalizedSymbol}@markPrice@1s`
        : `wss://stream.binance.com:9443/ws/${normalizedSymbol}@ticker`;

    try {
      console.log('[useBinanceTicker] connect websocket', { symbol, type, wsUrl });
      const socket = new WebSocket(wsUrl);
      ws.current = socket;

      socket.onopen = () => {
        reconnectAttempts.current = 0;
        lastMessageAt.current = Date.now();
        console.log('[useBinanceTicker] ws open', { symbol, type, wsUrl });
      };

      socket.onmessage = (e) => {
        try {
          const raw = JSON.parse(e.data);
          const message = raw?.data ?? raw;
          lastMessageAt.current = Date.now();

          messageCount.current += 1;
          if (messageCount.current % 20 === 0) {
            console.log('[useBinanceTicker] ws message sample', {
              symbol,
              type,
              eventType: message?.e,
              price: message?.c ?? message?.p,
            });
          }

          const normalized = normalizeTickerData(message);

          if (normalized) {
            setTicker(prev => {
              const nextTicker = {
                price: normalized.price,
                change:
                  Number.isFinite(normalized.change) ? normalized.change : prev.change,
              };

              return prev.price === nextTicker.price && prev.change === nextTicker.change
                ? prev
                : nextTicker;
            });
          }
        } catch (err) {
          console.log('[useBinanceTicker] ws message parse error', { symbol, type, error: err });
        }
      };

      socket.onerror = (err) => {
        console.log('[useBinanceTicker] ws error', { symbol, type, error: err });
      };

      socket.onclose = (event) => {
        console.log('[useBinanceTicker] ws close', { symbol, type, code: event.code, reason: event.reason });
        if (ws.current === socket) {
          ws.current = null;
        }

        if (isMounted.current) {
          const attempt = reconnectAttempts.current + 1;
          reconnectAttempts.current = attempt;
          const delayMs = Math.min(10000, 1000 * attempt);

          reconnectTimer.current = setTimeout(() => {
            console.log('[useBinanceTicker] ws reconnect', { symbol, type, attempt, delayMs });
            connect();
          }, delayMs);
        }
      };
    } catch (err) {
      console.log('[useBinanceTicker] websocket connection failed', { symbol, type, error: err });
    }
  }, [symbol, type]);

  useEffect(() => {
    isMounted.current = true;
    setTicker({ price: 0, change: 0 });
    connect();

    healthCheckTimer.current = setInterval(() => {
      if (!isMounted.current || appState.current !== 'active') {
        return;
      }

      const staleMs = Date.now() - lastMessageAt.current;
      const isSocketOpen = ws.current?.readyState === WebSocket.OPEN;

      if (!isSocketOpen || staleMs > 12000) {
        console.log('[useBinanceTicker] ws healthcheck reconnect', {
          symbol,
          type,
          isSocketOpen,
          staleMs,
        });
        connect();
      }
    }, 5000);

    const subscription = AppState.addEventListener('change', nextAppState => {
      if (
        appState.current.match(/inactive|background/) &&
        nextAppState === 'active'
      ) {
        connect();
      }
      appState.current = nextAppState;
    });

    return () => {
      isMounted.current = false;
      subscription.remove();
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current);
        reconnectTimer.current = null;
      }
      if (healthCheckTimer.current) {
        clearInterval(healthCheckTimer.current);
        healthCheckTimer.current = null;
      }
      if (ws.current) {
        ws.current.close();
        ws.current = null;
      }
    };
  }, [connect]);

  return ticker;
}