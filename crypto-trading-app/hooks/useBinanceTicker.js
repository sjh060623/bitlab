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
  const appState = useRef(AppState.currentState);

  const connect = useCallback(() => {
    if (!symbol) return;

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

        const response = await fetch(url);
        const data = await response.json();
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
      } catch (e) {}
    };

    fetchInitialPrice();

    const baseUrl =
      type === 'FUTURES'
        ? 'wss://fstream.binance.com/ws/'
        : 'wss://stream.binance.com:9443/ws/';

    const wsUrl = `${baseUrl}${symbol.toLowerCase()}@ticker`;

    try {
      const socket = new WebSocket(wsUrl);
      ws.current = socket;

      socket.onmessage = (e) => {
        try {
          const message = JSON.parse(e.data);
          const normalized = normalizeTickerData(message);

          if (normalized) {
            setTicker(prev =>
              prev.price === normalized.price && prev.change === normalized.change
                ? prev
                : normalized,
            );
          }
        } catch (err) {}
      };

      socket.onclose = () => {
        if (ws.current === socket) {
          ws.current = null;
        }
      };
    } catch (err) {}
  }, [symbol, type]);

  useEffect(() => {
    setTicker({ price: 0, change: 0 });
    connect();

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
      subscription.remove();
      if (ws.current) {
        ws.current.close();
        ws.current = null;
      }
    };
  }, [connect]);

  return ticker;
}