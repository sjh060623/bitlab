import { useState, useEffect, useRef, useCallback } from 'react';
import { AppState } from 'react-native';

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
        let url;
        if (type === 'FUTURES') {
          url = `https://fapi.binance.com/fapi/v1/ticker/24hr?symbol=${symbol}`;
        } else {
          url = `https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}`;
        }
        
        const response = await fetch(url);
        const data = await response.json();
        
        setTicker(prev => {
            if (ws.current && ws.current.readyState === WebSocket.OPEN && prev.price > 0) return prev;
            return {
                price: parseFloat(data.lastPrice),
                change: parseFloat(data.priceChangePercent)
            };
        });
      } catch (e) {}
    };

    fetchInitialPrice();

    let baseUrl;
    if (type === 'FUTURES') {
      baseUrl = 'wss://fstream.binance.com/ws/';
    } else {
      baseUrl = 'wss://stream.binance.com:9443/ws/';
    }

    const wsUrl = `${baseUrl}${symbol.toLowerCase()}@ticker`;

    try {
      const socket = new WebSocket(wsUrl);
      ws.current = socket;

      socket.onmessage = (e) => {
        try {
          const message = JSON.parse(e.data);
          if (message.c) {
            setTicker({
              price: parseFloat(message.c),
              change: parseFloat(message.P || 0),
            });
          }
        } catch (err) {}
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