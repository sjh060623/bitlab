import { FontAwesome5, Ionicons } from "@expo/vector-icons";
import Slider from "@react-native-community/slider";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { Colors } from "../components/Color";
import useBinanceTicker from "../hooks/useBinanceTicker";
import useBinanceOrderBook from "../hooks/useBinanceOrderBook";
import { Storage } from "../utils/storage";

const COIN_LIST = [
  { name: "Bitcoin", symbol: "BTCUSDT", icon: "bitcoin", color: "#f7931a", precision: 2 },
];

const OrderRow = React.memo(({ price, amount, width, type }) => {
  const widthAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(widthAnim, {
      toValue: width,
      duration: 200,
      useNativeDriver: false,
    }).start();
  }, [width]);

  return (
    <View style={styles.orderRow}>
      <Text style={[styles.bookPrice, { color: type === 'ask' ? Colors.down : Colors.up }]}>
        {price}
      </Text>
      <Text style={styles.bookAmt}>{amount.toFixed(4)}</Text>
      <Animated.View
        style={[
          styles.bgBar,
          {
            backgroundColor: type === 'ask' ? Colors.down : Colors.up,
            width: widthAnim.interpolate({
              inputRange: [0, 100],
              outputRange: ["0%", "100%"],
            }),
          },
        ]}
      />
    </View>
  );
});

const OrderBook = React.memo(({ symbol, currentPrice, type, precision }) => {
  const { bids, asks, isLoading } = useBinanceOrderBook(symbol, type);

  if (isLoading && bids.length === 0) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="small" color={Colors.up} />
      </View>
    );
  }

  const renderAsks = [...asks].reverse();

  return (
    <>
      {renderAsks.map((item, i) => (
        <OrderRow
          key={`ask-${i}`}
          price={item.price}
          amount={item.amount}
          width={item.width}
          type="ask"
        />
      ))}

      <View style={styles.currentPriceRow}>
        <Text style={styles.centerPrice}>
          {currentPrice > 0 
            ? currentPrice.toLocaleString(undefined, { minimumFractionDigits: precision, maximumFractionDigits: precision }) 
            : "---"}
        </Text>
      </View>

      {bids.map((item, i) => (
        <OrderRow
          key={`bid-${i}`}
          price={item.price}
          amount={item.amount}
          width={item.width}
          type="bid"
        />
      ))}
    </>
  );
});

export default function TradeScreen() {
  const activeSymbol = "BTCUSDT";
  const displaySymbol = activeSymbol.replace("USDT", "") + "/USDT";

  const activeCoin = COIN_LIST[0];
  const precision = activeCoin.precision;

  const { price: currentPrice, change: priceChange } = useBinanceTicker(
    activeSymbol,
    "SPOT",
  );
  
  const isLoading = !currentPrice || currentPrice === 0;

  const [balance, setBalance] = useState(0);
  const [holding, setHolding] = useState({ amount: 0, avgPrice: 0 });
  const [amountPercent, setAmountPercent] = useState(0);
  const [side, setSide] = useState("BUY");

  const loadData = useCallback(async () => {
    const bal = await Storage.getBalance();
    const holdings = await Storage.getSpotHoldings();

    setBalance(bal);
    setHolding(holdings[activeSymbol] || { amount: 0, avgPrice: 0 });
  }, [activeSymbol]);

  useFocusEffect(
    useCallback(() => {
      loadData();
      const interval = setInterval(loadData, 3000); 
      return () => clearInterval(interval);
    }, [loadData])
  );

  const handleOrder = async () => {
    if (isLoading) return;
    if (amountPercent === 0)
      return Alert.alert("Notice", "Please set an amount.");

    let success = false;
    let tradeMessage = "";

    if (side === "BUY") {
      const cost = balance * (amountPercent / 100);
      if (cost < 10) return Alert.alert("Notice", "Min Buy is $10");

      const buyAmount = cost / currentPrice;

      success = await Storage.handleSpotTrade(
        activeSymbol,
        "BUY",
        buyAmount,
        currentPrice,
      );
      tradeMessage = `Bought ${buyAmount.toFixed(6)} ${activeSymbol.replace("USDT", "")}`;
    } else {
      if (holding.amount <= 0)
        return Alert.alert("Error", "Insufficient coins to sell.");
      const sellAmount = holding.amount * (amountPercent / 100);
      const revenue = sellAmount * currentPrice;

      if (revenue < 1)
        return Alert.alert("Notice", "Amount too small to sell.");

      success = await Storage.handleSpotTrade(
        activeSymbol,
        "SELL",
        sellAmount,
        currentPrice,
      );
      tradeMessage = `Sold ${sellAmount.toFixed(6)} for $${revenue.toFixed(2)}`;
    }

    if (success) {
      Alert.alert("Success", tradeMessage);
      await loadData();
      setAmountPercent(0);
    } else {
      Alert.alert("Error", "Transaction failed. Check balance or holdings.");
    }
  };

  const calculateSpotStats = () => {
    if (!holding || holding.amount === 0)
      return { value: 0, pnl: 0, pnlPercent: 0 };
    const currentValue = holding.amount * currentPrice;
    const costBasis = holding.amount * holding.avgPrice;
    const pnl = currentValue - costBasis;
    const pnlPercent = costBasis > 0 ? (pnl / costBasis) * 100 : 0;
    return { value: currentValue, pnl, pnlPercent };
  };

  const stats = calculateSpotStats();
  const isProfit = stats.pnl >= 0;

  return (
    <LinearGradient colors={Colors.backgroundGradient} style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.iconBg}>
            <FontAwesome5
              name={activeCoin.icon}
              size={16}
              color={activeCoin.icon === "mixer" ? "#000" : "#fff"}
              style={activeCoin.icon === "mixer" ? {transform:[{rotate:'90deg'}]} : {}}
            />
          </View>
          <View>
            <View style={{flexDirection:'row', alignItems:'center', gap: 4}}>
                <Text style={styles.symbol}>{displaySymbol}</Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
              <Text style={[styles.price, { color: Colors.up }]}>
                {isLoading ? "Loading..." : `$${currentPrice.toLocaleString(undefined, {minimumFractionDigits: precision})}`}
              </Text>
              {!isLoading && (
                <Text
                  style={{
                    color: priceChange >= 0 ? Colors.up : Colors.down,
                    fontSize: 12,
                    fontWeight: "bold",
                  }}
                >
                  {priceChange >= 0 ? "+" : ""}
                  {priceChange.toFixed(2)}%
                </Text>
              )}
            </View>
          </View>
        </View>

        <View style={styles.headerRight}>
          <Text style={styles.label}>Available</Text>
          <Text style={styles.balance}>
            ${balance.toLocaleString(undefined, {
              maximumFractionDigits: 2,
            })}
          </Text>
        </View>
      </View>

      <View style={styles.contentContainer}>
        <BlurView intensity={20} tint="dark" style={styles.controlPanel}>
          <View style={styles.tabContainer}>
            <TouchableOpacity
              onPress={() => setSide("BUY")}
              style={[styles.tab, side === "BUY" && styles.activeTabBuy]}
            >
              <Text
                style={[styles.tabText, side === "BUY" && { color: "#fff" }]}
              >
                Buy
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setSide("SELL")}
              style={[styles.tab, side === "SELL" && styles.activeTabSell]}
            >
              <Text
                style={[styles.tabText, side === "SELL" && { color: "#fff" }]}
              >
                Sell
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.balanceInfo}>
            <Text style={styles.smallLabel}>Available</Text>
            {side === "BUY" ? (
              <Text style={styles.balanceText}>
                $
                {balance.toLocaleString(undefined, {
                  maximumFractionDigits: 2,
                })}
              </Text>
            ) : (
              <Text style={styles.balanceText}>
                {holding.amount.toFixed(6)} {activeSymbol.replace("USDT", "")}
              </Text>
            )}
          </View>

          <View style={styles.sliderCard}>
            <View style={styles.rowBetween}>
              <Text style={styles.smallLabel}>Amount</Text>
              <Text style={styles.valueText}>{amountPercent.toFixed(0)}%</Text>
            </View>
            <Slider
              style={{ width: "100%", height: 30 }}
              minimumValue={0}
              maximumValue={100}
              step={1}
              value={amountPercent}
              onValueChange={setAmountPercent}
              minimumTrackTintColor={side === "BUY" ? Colors.up : Colors.down}
              maximumTrackTintColor="rgba(255,255,255,0.1)"
              thumbTintColor="#fff"
              disabled={isLoading}
            />
            <View style={[styles.rowBetween, { marginTop: 4 }]}>
              <Text style={styles.smallLabel}>Est. Value</Text>
              <Text style={styles.infoValue}>
                {side === "BUY"
                  ? isLoading 
                    ? "---"
                    : `$${((balance * amountPercent) / 100).toFixed(2)}`
                  : isLoading 
                    ? "---"
                    : `$${(((holding.amount * amountPercent) / 100) * currentPrice).toFixed(2)}`}
              </Text>
            </View>
          </View>

          <TouchableOpacity
            onPress={handleOrder}
            style={{ marginTop: 15 }}
            disabled={isLoading}
          >
            <LinearGradient
              colors={
                side === "BUY"
                  ? [Colors.up, "#2e7d32"]
                  : [Colors.down, "#c62828"]
              }
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={[styles.actionBtn, { opacity: isLoading ? 0.5 : 1 }]}
            >
              <Text style={styles.btnText}>
                {isLoading
                  ? "Wait..."
                  : side === "BUY"
                    ? "Buy Spot"
                    : "Sell Spot"}
              </Text>
            </LinearGradient>
          </TouchableOpacity>
        </BlurView>

        <View style={styles.bookPanel}>
          <Text style={styles.sectionTitle}>Order Book</Text>
          <OrderBook 
            symbol={activeSymbol} 
            currentPrice={currentPrice} 
            type="SPOT" 
            precision={precision}
          />
        </View>
      </View>

      <View style={{ flex: 1, paddingHorizontal: 15, marginTop: 15 }}>
        <Text style={styles.sectionTitle}>
          My Asset ({activeSymbol.replace("USDT", "")})
        </Text>

        {isLoading ? (
            <BlurView intensity={20} tint="dark" style={styles.emptyCard}>
                <ActivityIndicator size="small" color={Colors.textDim} />
                <Text style={{ color: Colors.textDim, marginTop: 8, fontSize: 12 }}>
                    Updating prices...
                </Text>
            </BlurView>
        ) : holding.amount > 0 ? (
          <BlurView intensity={20} tint="dark" style={styles.positionCard}>
            <View style={styles.posHeader}>
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
              >
                <FontAwesome5 name="wallet" size={14} color={Colors.textDim} />
                <Text style={styles.posSymbol}>
                  {holding.amount.toFixed(6)} {activeSymbol.replace("USDT", "")}
                </Text>
              </View>
              <Text style={styles.dataLabel}>Spot Wallet</Text>
            </View>

            <View style={{ marginBottom: 10 }}>
              <Text style={styles.dataLabel}>Unrealized PnL</Text>
              <Text
                style={[
                  styles.pnlBig,
                  { color: isProfit ? Colors.up : Colors.down },
                ]}
              >
                {isProfit ? "+" : ""}
                {stats.pnl.toFixed(2)} ({stats.pnlPercent.toFixed(2)}%)
              </Text>
            </View>

            <View style={styles.gridRow}>
              <View style={styles.gridItem}>
                <Text style={styles.dataLabel}>Avg Price</Text>
                <Text style={styles.dataValue}>
                  $
                  {holding.avgPrice.toLocaleString(undefined, {
                    maximumFractionDigits: 2,
                  })}
                </Text>
              </View>
              <View style={[styles.gridItem, { alignItems: "flex-end" }]}>
                <Text style={styles.dataLabel}>Current Value</Text>
                <Text style={styles.dataValue}>${stats.value.toFixed(2)}</Text>
              </View>
            </View>
          </BlurView>
        ) : (
          <BlurView intensity={20} tint="dark" style={styles.emptyCard}>
            <Ionicons name="wallet-outline" size={30} color={Colors.textDim} />
            <Text
              style={{ color: Colors.textDim, marginTop: 10, fontSize: 12 }}
            >
              You don't hold any {activeSymbol.replace("USDT", "")}
            </Text>
          </BlurView>
        )}
      </View>

    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 50 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    marginBottom: 15,
  },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  iconBg: {
    width: 32,
    height: 32,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  symbol: { color: "#fff", fontSize: 14, fontWeight: "bold" },
  headerSub: { color: Colors.textDim, fontSize: 10 },
  price: { fontSize: 18, fontWeight: "bold", color: "#fff" },
  headerRight: { justifyContent: "center" },

  contentContainer: {
    flexDirection: "row",
    paddingHorizontal: 15,
    height: 320,
  },
  controlPanel: {
    flex: 0.6,
    borderRadius: 20,
    padding: 12,
    marginRight: 10,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.03)",
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    overflow: "hidden",
  },
  bookPanel: { flex: 0.4, paddingVertical: 5 },

  tabContainer: {
    flexDirection: "row",
    backgroundColor: "rgba(0,0,0,0.3)",
    borderRadius: 10,
    padding: 2,
    marginBottom: 15,
    overflow: "hidden",
  },
  tab: { flex: 1, alignItems: "center", paddingVertical: 8, borderRadius: 8 },
  activeTabBuy: { backgroundColor: Colors.up },
  activeTabSell: { backgroundColor: Colors.down },
  tabText: { color: Colors.textDim, fontSize: 11, fontWeight: "bold" },

  balanceInfo: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 15,
  },
  balanceText: { color: "#fff", fontWeight: "bold", fontSize: 12 },

  sliderCard: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    overflow: "hidden",
  },
  rowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 2,
  },
  smallLabel: { color: Colors.textDim, fontSize: 10 },
  valueText: { color: "#fff", fontSize: 12, fontWeight: "bold" },
  infoValue: { color: "#fff", fontSize: 11, fontWeight: "bold" },

  actionBtn: { borderRadius: 12, paddingVertical: 12, alignItems: "center" },
  btnText: { color: "#fff", fontWeight: "bold", fontSize: 14 },

  sectionTitle: {
    color: Colors.textDim,
    fontSize: 11,
    fontWeight: "600",
    marginBottom: 8,
    textTransform: "uppercase",
  },

  orderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    height: 22,
    position: "relative",
  },
  bookPrice: { fontSize: 11, fontWeight: "600", zIndex: 1 },
  bookAmt: { color: Colors.textDim, fontSize: 10, zIndex: 1 }, 
  bgBar: {
    position: "absolute",
    right: 0,
    height: "100%",
    opacity: 0.15,
    borderRadius: 2,
  },

  currentPriceRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginVertical: 8,
  },
  centerPrice: { color: "#fff", fontSize: 14, fontWeight: "bold" },

  emptyCard: {
    borderRadius: 16,
    alignItems: "center",
    padding: 20,
    backgroundColor: "rgba(255,255,255,0.02)",
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    overflow: "hidden",
  },
  positionCard: {
    borderRadius: 16,
    padding: 15,
    marginBottom: 10,
    backgroundColor: "rgba(255,255,255,0.02)",
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    overflow: "hidden",
  },
  posHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  posSymbol: { color: "#fff", fontWeight: "bold", fontSize: 13 },

  pnlBig: { fontSize: 18, fontWeight: "bold" },
  gridRow: { flexDirection: "row", justifyContent: "space-between" },
  gridItem: { flex: 1 },
  dataLabel: { color: Colors.textDim, fontSize: 10 },
  dataValue: { color: "#fff", fontSize: 12, fontWeight: "600", marginTop: 2 },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
  coinModalContent: {
    width: 320,
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    alignItems: "center",
    maxHeight: '60%'
  },
  modalTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 15,
  },
  modalBtn: {
    backgroundColor: Colors.up,
    width: "100%",
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 15,
  },
  modalBtnText: { color: "#fff", fontWeight: "bold" },
  
  coinItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      paddingHorizontal: 10,
      width: '100%',
      borderRadius: 12
  },
  coinName: { color: '#fff', fontSize: 16, fontWeight: 'bold', flex: 1 },
  coinSymbol: { color: Colors.textDim, fontSize: 14 }
});