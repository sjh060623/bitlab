import AsyncStorage from "@react-native-async-storage/async-storage";

const KEYS = {
  BALANCE: "user_balance",
  POSITIONS: "user_positions",
  HOLDINGS: "user_spot_holdings",
  TRANSACTIONS: "user_transactions",
};

const INITIAL_BALANCE = 10000;

export const Storage = {
  getBalance: async () => {
    try {
      const balance = await AsyncStorage.getItem(KEYS.BALANCE);
      const parsed = parseFloat(balance);
      return !isNaN(parsed) ? parsed : INITIAL_BALANCE;
    } catch (e) {
      return INITIAL_BALANCE;
    }
  },

  getPositions: async () => {
    try {
      const jsonValue = await AsyncStorage.getItem(KEYS.POSITIONS);
      return jsonValue != null ? JSON.parse(jsonValue) : [];
    } catch (e) {
      return [];
    }
  },

  getSpotHoldings: async () => {
    try {
      const jsonValue = await AsyncStorage.getItem(KEYS.HOLDINGS);
      return jsonValue != null ? JSON.parse(jsonValue) : {};
    } catch (e) {
      return {};
    }
  },

  getTransactions: async () => {
    try {
      const jsonValue = await AsyncStorage.getItem(KEYS.TRANSACTIONS);
      return jsonValue != null ? JSON.parse(jsonValue) : [];
    } catch (e) {
      return [];
    }
  },

  deposit: async (amount) => {
    try {
      const value = parseFloat(amount);
      if (isNaN(value) || value <= 0) return false;

      const currentBalance = await Storage.getBalance();
      const newBalance = currentBalance + value;
      await AsyncStorage.setItem(KEYS.BALANCE, newBalance.toString());

      const transactions = await Storage.getTransactions();
      transactions.push({
        id: Date.now().toString(),
        type: "Deposit",
        symbol: "USDT",
        amount: value,
        date: new Date().toISOString(),
      });
      await AsyncStorage.setItem(
        KEYS.TRANSACTIONS,
        JSON.stringify(transactions),
      );

      return true;
    } catch (e) {
      return false;
    }
  },

  handleSpotTrade: async (symbol, side, amount, price) => {
    try {
      const currentBalance = await Storage.getBalance();
      const holdings = await Storage.getSpotHoldings();
      const transactions = await Storage.getTransactions();

      const totalCost = amount * price;
      const current = holdings[symbol] || { amount: 0, avgPrice: 0 };

      if (side === "BUY") {
        if (currentBalance < totalCost) return false;
        const newBalance = currentBalance - totalCost;
        await AsyncStorage.setItem(KEYS.BALANCE, newBalance.toString());

        const totalVal = current.amount * current.avgPrice + totalCost;
        const newAmount = current.amount + amount;
        const newAvgPrice = totalVal / newAmount;
        holdings[symbol] = { amount: newAmount, avgPrice: newAvgPrice };

        transactions.push({
          id: Date.now().toString(),
          type: "BUY",
          symbol,
          price,
          quantity: amount,
          amount: totalCost,
          date: new Date().toISOString(),
        });
      } else if (side === "SELL") {
        if (current.amount < amount) return false;
        const newBalance = currentBalance + totalCost;
        await AsyncStorage.setItem(KEYS.BALANCE, newBalance.toString());

        const newAmount = current.amount - amount;
        if (newAmount <= 0.000001) {
          delete holdings[symbol];
        } else {
          holdings[symbol] = { ...current, amount: newAmount };
        }

        transactions.push({
          id: Date.now().toString(),
          type: "SELL",
          symbol,
          price,
          quantity: amount,
          amount: totalCost,
          date: new Date().toISOString(),
        });
      }

      await AsyncStorage.setItem(KEYS.HOLDINGS, JSON.stringify(holdings));
      await AsyncStorage.setItem(
        KEYS.TRANSACTIONS,
        JSON.stringify(transactions),
      );
      return true;
    } catch (e) {
      return false;
    }
  },

  openPosition: async (position) => {
    try {
      const currentBalance = await Storage.getBalance();
      const margin = parseFloat(position.margin);

      if (currentBalance < margin) return false;

      const newBalance = currentBalance - margin;
      await AsyncStorage.setItem(KEYS.BALANCE, newBalance.toString());

      const positions = await Storage.getPositions();
      const newPosition = { ...position, id: Date.now().toString() };
      const newPositions = [newPosition, ...positions];
      await AsyncStorage.setItem(KEYS.POSITIONS, JSON.stringify(newPositions));

      const transactions = await Storage.getTransactions();
      transactions.push({
        id: Date.now().toString(),
        type: position.side,
        symbol: position.symbol,
        price: position.entryPrice,
        amount: margin,
        leverage: position.leverage,
        date: new Date().toISOString(),
      });
      await AsyncStorage.setItem(
        KEYS.TRANSACTIONS,
        JSON.stringify(transactions),
      );

      return true;
    } catch (e) {
      return false;
    }
  },

  closePosition: async (id, finalPnl) => {
    try {
      const positions = await Storage.getPositions();
      const target = positions.find((p) => p.id === id);

      if (!target) return null;

      const returnAmount = parseFloat(target.margin) + parseFloat(finalPnl);
      const currentBalance = await Storage.getBalance();
      const newBalance = currentBalance + returnAmount;
      await AsyncStorage.setItem(KEYS.BALANCE, newBalance.toString());

      const remaining = positions.filter((p) => p.id !== id);
      await AsyncStorage.setItem(KEYS.POSITIONS, JSON.stringify(remaining));

      const transactions = await Storage.getTransactions();
      transactions.push({
        id: Date.now().toString(),
        type: "CLOSE",
        symbol: target.symbol,
        price: 0,
        amount: returnAmount,
        pnl: finalPnl,
        date: new Date().toISOString(),
      });
      await AsyncStorage.setItem(
        KEYS.TRANSACTIONS,
        JSON.stringify(transactions),
      );

      return { remaining, target };
    } catch (e) {
      return { remaining: [], target: null };
    }
  },

  resetAccount: async () => {
    try {
      await AsyncStorage.setItem(KEYS.BALANCE, INITIAL_BALANCE.toString());
      await AsyncStorage.setItem(KEYS.POSITIONS, JSON.stringify([]));
      await AsyncStorage.setItem(KEYS.HOLDINGS, JSON.stringify({}));
      await AsyncStorage.setItem(KEYS.TRANSACTIONS, JSON.stringify([]));
      await AsyncStorage.removeItem("pnlDate");
      await AsyncStorage.removeItem("startEquity");
      await AsyncStorage.removeItem("startBalance");
      return INITIAL_BALANCE;
    } catch (e) {
      return INITIAL_BALANCE;
    }
  },
};