import { FontAwesome5, Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { Colors } from "../components/Color";
import useBinanceTicker from "../hooks/useBinanceTicker";
import { Storage } from "../utils/storage";

const CoinCard = ({ item, onPress, type }) => {
  const { price, change } = useBinanceTicker(item.symbol, type);
  const isUp = change >= 0;

  return (
    <TouchableOpacity onPress={() => onPress(item.symbol)} activeOpacity={0.7}>
      <BlurView intensity={20} tint="dark" style={styles.coinCard}>
        <View style={styles.coinHeader}>
          <View style={[styles.coinIcon, { backgroundColor: item.color }]}>
            <FontAwesome5
              name={item.icon}
              size={20}
              style={{
                transform: item.icon === "mixer" ? [{ rotate: "90deg" }] : [],
              }}
              color={item.icon === "mixer" ? "#000" : "#fff"}
            />
          </View>
          <View>
            <Text style={styles.coinName}>{item.name}</Text>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Text style={styles.coinSymbol}>
                {item.symbol.replace("USDT", "")}
              </Text>
              {type === "FUTURES" && (
                <View style={styles.perpTag}>
                  <Text style={styles.perpText}>PERP</Text>
                </View>
              )}
            </View>
          </View>
        </View>

        <View style={styles.coinPriceBox}>
          <Text style={styles.coinPrice}>
            ${price > 0 ? price.toLocaleString() : "..."}
          </Text>
          <Text
            style={[
              styles.coinChange,
              { color: isUp ? Colors.up : Colors.down },
            ]}
          >
            {isUp ? "+" : ""}
            {change.toFixed(2)}%
          </Text>
        </View>
      </BlurView>
    </TouchableOpacity>
  );
};

export default function HomeScreen() {
  const router = useRouter();
  const [totalEquity, setTotalEquity] = useState(0); 
  const [pnl, setPnl] = useState({ amount: 0, percent: 0 });
  const [refreshing, setRefreshing] = useState(false);
  const [marketTab, setMarketTab] = useState("SPOT");

  const loadData = async () => {
    try {
      const cashBalance = await Storage.getBalance();
      const positions = await Storage.getPositions();
      let totalMargin = 0;
      let totalUnrealizedPnl = 0;

      positions.forEach((pos) => {
        totalMargin += parseFloat(pos.margin || 0);
        totalUnrealizedPnl += parseFloat(pos.pnl || 0);
      });

      const spotHoldings = await Storage.getSpotHoldings();
      let spotTotalValue = 0;

      Object.keys(spotHoldings).forEach((symbol) => {
        const holding = spotHoldings[symbol];
        if (holding.amount > 0.00001) {
          spotTotalValue += holding.amount * holding.avgPrice;
        }
      });

      const calculatedEquity =
        cashBalance + totalMargin + totalUnrealizedPnl + spotTotalValue;

      setTotalEquity(calculatedEquity);

      const todayStr = new Date().toDateString();
      const storedDate = await AsyncStorage.getItem("pnlDate");
      let startEquity = parseFloat(await AsyncStorage.getItem("startEquity"));

      if (storedDate !== todayStr || isNaN(startEquity)) {
        startEquity = calculatedEquity;
        await AsyncStorage.setItem("pnlDate", todayStr);
        await AsyncStorage.setItem("startEquity", startEquity.toString());
      }

      const diff = calculatedEquity - startEquity;
      const percent = startEquity === 0 ? 0 : (diff / startEquity) * 100;

      setPnl({
        amount: diff,
        percent: percent,
      });
    } catch (e) {}
  };

  useFocusEffect(
    useCallback(() => {
      loadData();
      const interval = setInterval(loadData, 5000);
      return () => clearInterval(interval);
    }, [])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, []);

  const goTrade = (symbol) => {
    router.push({
      pathname: "/chart",
      params: { symbol, type: marketTab },
    });
  };

  const COINS = [
    { name: "Bitcoin", symbol: "BTCUSDT", icon: "bitcoin", color: "#f7931a" },
    { name: "Ethereum", symbol: "ETHUSDT", icon: "ethereum", color: "#627eea" },
    { name: "Ripple", symbol: "XRPUSDT", icon: "mixer", color: "#fff" },
  ];

  const isPnlPositive = pnl.amount >= 0;

  return (
    <LinearGradient colors={Colors.backgroundGradient} style={styles.container}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#fff"
          />
        }
      >
        <View style={styles.topSection}>
          <Text style={styles.label}>Total Assets</Text>
          <Text style={styles.balance}>
            ${totalEquity.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </Text>
        </View>

        <BlurView intensity={20} tint="dark" style={styles.pnlCard}>
          <View style={styles.pnlRow}>
            <Text style={styles.pnlLabel}>Today's PNL</Text>
            <View
              style={[
                styles.pnlBadge,
                {
                  backgroundColor: isPnlPositive
                    ? "rgba(38, 166, 154, 0.15)"
                    : "rgba(239, 83, 80, 0.15)",
                },
              ]}
            >
              <Ionicons
                name={isPnlPositive ? "caret-up" : "caret-down"}
                size={12}
                color={isPnlPositive ? Colors.up : Colors.down}
              />
              <Text
                style={[
                  styles.pnlText,
                  { color: isPnlPositive ? Colors.up : Colors.down },
                ]}
              >
                {isPnlPositive ? "+" : ""}
                {pnl.amount.toLocaleString(undefined, {
                  maximumFractionDigits: 2,
                })}{" "}
                ({pnl.percent.toFixed(2)}%)
              </Text>
            </View>
          </View>
        </BlurView>

        <View style={styles.marketHeader}>
          <Text style={styles.sectionTitle}>Markets</Text>
          <View style={styles.tabSwitch}>
            <TouchableOpacity
              style={[styles.tabItem, marketTab === "SPOT" && styles.activeTab]}
              onPress={() => setMarketTab("SPOT")}
            >
              <Text
                style={[
                  styles.tabText,
                  marketTab === "SPOT" && styles.activeTabText,
                ]}
              >
                Spot
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.tabItem,
                marketTab === "FUTURES" && styles.activeTab,
              ]}
              onPress={() => setMarketTab("FUTURES")}
            >
              <Text
                style={[
                  styles.tabText,
                  marketTab === "FUTURES" && styles.activeTabText,
                ]}
              >
                Futures
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.coinGrid}>
          {COINS.map((coin) => (
            <CoinCard
              key={coin.symbol}
              item={coin}
              onPress={goTrade}
              type={marketTab}
            />
          ))}
        </View>
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 70, paddingHorizontal: 20 },
  topSection: { alignItems: "center", marginBottom: 25 },
  label: {
    color: Colors.textDim,
    fontSize: 13,
    textTransform: "uppercase",
    letterSpacing: 1,
    fontWeight: "600",
  },
  balance: {
    color: "#fff",
    fontSize: 40,
    fontWeight: "bold",
    marginTop: 8,
    textShadowColor: "rgba(255,255,255,0.1)",
    textShadowRadius: 10,
  },
  pnlCard: {
    borderRadius: 20,
    padding: 16,
    marginBottom: 25,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    overflow: "hidden",
  },
  pnlRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  pnlLabel: { color: Colors.textDim, fontSize: 14, fontWeight: "600" },
  pnlBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
  },
  pnlText: { fontWeight: "bold", fontSize: 14, marginLeft: 4 },
  marketHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 15,
  },
  sectionTitle: {
    color: Colors.textDim,
    fontSize: 16,
    fontWeight: "bold",
  },
  tabSwitch: {
    flexDirection: "row",
    backgroundColor: "rgba(0,0,0,0.3)",
    borderRadius: 10,
    padding: 3,
  },
  tabItem: { paddingVertical: 6, paddingHorizontal: 14, borderRadius: 8 },
  activeTab: { backgroundColor: "rgba(255,255,255,0.1)" },
  tabText: { color: Colors.textDim, fontSize: 12, fontWeight: "600" },
  activeTabText: { color: "#fff" },
  coinGrid: { gap: 12 },
  coinCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    overflow: "hidden",
  },
  coinHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  coinIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  coinName: { color: "#fff", fontSize: 16, fontWeight: "bold" },
  coinSymbol: { color: Colors.textDim, fontSize: 12, marginTop: 2 },
  perpTag: {
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 4,
    paddingHorizontal: 4,
    marginLeft: 6,
    paddingVertical: 1,
  },
  perpText: { color: Colors.up, fontSize: 9, fontWeight: "bold" },
  coinPriceBox: { alignItems: "flex-end" },
  coinPrice: { color: "#fff", fontSize: 16, fontWeight: "bold" },
  coinChange: { fontSize: 13, marginTop: 4, fontWeight: "600" },
});