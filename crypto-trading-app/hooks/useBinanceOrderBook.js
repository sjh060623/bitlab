import { useState, useEffect, useRef } from 'react';

export default function useBinanceOrderBook(symbol = 'BTCUSDT', type = 'SPOT') {
  const [orderBook, setOrderBook] = useState({ bids: [], asks: [] });
  const [isLoading, setIsLoading] = useState(true);
  const ws = useRef(null);

  useEffect(() => {
    if (!symbol) return;
    setIsLoading(true);

    if (ws.current) {
      ws.current.close();
      ws.current = null;
    }

    const baseUrl = type === 'FUTURES' 
      ? 'wss://fstream.binance.com/ws/' 
      : 'wss://stream.binance.com:9443/ws/';
    
    const wsUrl = `${baseUrl}${symbol.toLowerCase()}@depth10`;

    try {
      ws.current = new WebSocket(wsUrl);

      ws.current.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          
          const rawBids = data.b || data.bids || [];
          const rawAsks = data.a || data.asks || [];

          const bids = rawBids.slice(0, 5).map(item => ({
            price: parseFloat(item[0]),
            amount: parseFloat(item[1]),
          }));

          const asks = rawAsks.slice(0, 5).map(item => ({
            price: parseFloat(item[0]),
            amount: parseFloat(item[1]),
          }));

          const maxBid = Math.max(...bids.map(o => o.amount), 0);
          const maxAsk = Math.max(...asks.map(o => o.amount), 0);
          const totalMax = Math.max(maxBid, maxAsk) || 1; 

          const finalBids = bids.map(item => ({
            ...item,
            width: (item.amount / totalMax) * 100
          }));

          const finalAsks = asks.map(item => ({
            ...item,
            width: (item.amount / totalMax) * 100
          }));

          setOrderBook({ bids: finalBids, asks: finalAsks });
          setIsLoading(false);

        } catch (err) {}
      };

      ws.current.onerror = () => {
        setIsLoading(false);
      };

    } catch (err) {
      setIsLoading(false);
    }

    return () => {
      if (ws.current) {
        ws.current.close();
        ws.current = null;
      }
    };
  }, [symbol, type]);

  return { ...orderBook, isLoading };
}