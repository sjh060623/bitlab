import {
  FontAwesome5,
  Ionicons,
} from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  Alert,
  Dimensions,
  FlatList,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import AddFundModal from "../components/add-fund";
import { Colors } from "../components/Color";
import { Storage } from "../utils/storage";

const { width } = Dimensions.get("window");

const ActionButton = ({ icon, label, onPress, color = Colors.text }) => (
  <TouchableOpacity style={styles.actionBtn} onPress={onPress}>
    <View style={styles.actionIconCircle}>
      <Ionicons name={icon} size={24} color={color} />
    </View>
    <Text style={styles.actionLabel}>{label}</Text>
  </TouchableOpacity>
);

const AssetRow = ({ icon, name, amount, symbol, percent, color, value, isFutures }) => (
  <View style={styles.assetRow}>
    <View style={styles.assetInfo}>
      <View style={[styles.assetIcon, { backgroundColor: color }]}>
        <FontAwesome5 name={icon} size={16} color="#fff" />
      </View>
      <View>
        <Text style={styles.assetName}>{name}</Text>
        <Text style={styles.assetPercent}>
          {isNaN(percent) ? 0 : percent.toFixed(1)}%
        </Text>
      </View>
    </View>
    <View style={{ alignItems: "flex-end" }}>
      <Text style={styles.assetValue}>
        ${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}
      </Text>
      <Text style={styles.assetAmount}>
        {isFutures ? "Margin: " : ""}
        {amount.toLocaleString()}{" "}
        <Text style={{ fontSize: 11, color: Colors.textDim }}>
           {isFutures ? "USDT" : symbol}
        </Text>
      </Text>
    </View>
  </View>
);

const PositionHistoryItem = ({ item }) => {
  const isProfit = (item.pnl || 0) >= 0;
  const side = (item.side || "LONG").toUpperCase();
  const sideColor = side === "LONG" ? Colors.up : Colors.down;
  const pnlColor = isProfit ? Colors.up : Colors.down;
  const closedAt = item.closedAt || item.date;
  const dateObj = new Date(closedAt);
  const dateStr =
    dateObj.toLocaleDateString("ko-KR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }) +
    " " +
    dateObj.toLocaleTimeString("ko-KR", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });

  const entryPrice = item.entryPrice || 0;
  const exitPrice = item.exitPrice || 0;
  const margin = item.margin || 0;
  const leverage = item.leverage || 1;

  return (
    <View style={styles.txItem}>
      <View style={{ flex: 1 }}>
        <View style={styles.historyTopRow}>
          <Text style={styles.txType}>{item.symbol || "-"}</Text>
          <View style={[styles.sideBadge, { backgroundColor: "rgba(255,255,255,0.1)" }]}>
            <Text style={[styles.sideBadgeText, { color: sideColor }]}>{side}</Text>
          </View>
          <Text style={styles.historyType}>{item.type || "FUTURES"}</Text>
        </View>
        <Text style={styles.txDate}>시간: {dateStr}</Text>
        <View style={styles.priceRow}>
          <Text style={styles.priceLabel}>
            마진: <Text style={styles.priceValue}>${margin.toLocaleString(undefined, { maximumFractionDigits: 2 })}</Text>
          </Text>
          <Text style={styles.priceLabel}>
            배율: <Text style={styles.priceValue}>x{leverage}</Text>
          </Text>
        </View>
        <View style={styles.priceRow}>
          <Text style={styles.priceLabel}>
            진입: <Text style={styles.priceValue}>${entryPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}</Text>
          </Text>
          <Text style={styles.priceLabel}>
            청산: <Text style={styles.priceValue}>${exitPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}</Text>
          </Text>
        </View>
      </View>

      <View style={{ alignItems: "flex-end" }}>
        <Text style={[styles.txAmount, { color: pnlColor }]}>
          {isProfit ? "+" : ""}${(item.pnl || 0).toLocaleString(undefined, {
            maximumFractionDigits: 2,
          })}
        </Text>
        <Text style={[styles.txStatus, { color: pnlColor }]}> 
          수익률 {isProfit ? "+" : ""}{(item.roi || 0).toFixed(2)}%
        </Text>
      </View>
    </View>
  );
};

export default function AssetsScreen() {
  const [totalEquity, setTotalEquity] = useState(0);
  const [pnl, setPnl] = useState({ amount: 0, percent: 0 });
  const [positionHistory, setPositionHistory] = useState([]);
  const [portfolio, setPortfolio] = useState([]);
  const [isAddFundVisible, setIsAddFundVisible] = useState(false);
  const [hideBalance, setHideBalance] = useState(false);

  const [historyVisible, setHistoryVisible] = useState(false);

  const loadData = async () => {
    try {
      const cashBalance = await Storage.getBalance();
      const positions = await Storage.getPositions();
      let totalUnrealizedPnl = 0;

      const history = await Storage.getPositionHistory();
      history.sort(
        (a, b) =>
          new Date(b.closedAt || b.date) - new Date(a.closedAt || a.date),
      );
      setPositionHistory(history);

      const spotHoldings = await Storage.getSpotHoldings();

      const portfolioArr = [];
      let calculatedEquity = 0;

      if (cashBalance > 0) {
        portfolioArr.push({
          id: 'USDT-CASH',
          symbol: "USDT",
          name: "Available Cash",
          amount: cashBalance,
          value: cashBalance,
          icon: "wallet",
          color: "#26a69a",
          isFutures: false
        });
        calculatedEquity += cashBalance;
      }

      positions.forEach((pos, index) => {
        const margin = parseFloat(pos.margin);
        const pnl = parseFloat(pos.pnl || 0);
        const positionValue = margin + pnl;
        
        totalUnrealizedPnl += pnl;
        calculatedEquity += positionValue;

        portfolioArr.push({
            id: pos.id || `FUTURES-${index}`,
            symbol: pos.symbol,
            name: `${pos.symbol} ${pos.side}`,
            amount: margin,
            value: positionValue,
            icon: "chart-line",
            color: pos.side === 'LONG' ? Colors.up : Colors.down,
            isFutures: true
        });
      });

      Object.keys(spotHoldings).forEach((symbol, index) => {
        const holding = spotHoldings[symbol];
        if (holding.amount > 0.00001) {
          const sym = symbol.replace("USDT", "");
          const estimatedValue = holding.amount * holding.avgPrice; 
          calculatedEquity += estimatedValue;

          portfolioArr.push({
            id: `SPOT-${symbol}-${index}`,
            symbol: sym,
            name: sym,
            amount: holding.amount,
            value: estimatedValue,
            icon:
              sym === "BTC" ? "bitcoin" : sym === "ETH" ? "ethereum" : "coins",
            color:
              sym === "BTC" ? "#f7931a" : sym === "ETH" ? "#627eea" : "#888",
            isFutures: false
          });
        }
      });

      setTotalEquity(calculatedEquity);

      const finalPortfolio = portfolioArr.map((p) => ({
        ...p,
        percent: calculatedEquity > 0 ? (p.value / calculatedEquity) * 100 : 0,
      }));

      finalPortfolio.sort((a, b) => b.value - a.value);
      setPortfolio(finalPortfolio);

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

      setPnl({ amount: diff, percent });
    } catch (e) {}
  };

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, []),
  );

  const handleReset = () => {
    Alert.alert(
      "Reset Account",
      "Reset balance to $10,000 and clear history?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reset",
          style: "destructive",
          onPress: async () => {
            await Storage.resetAccount();
            loadData();
          },
        },
      ],
    );
  };

  const isProfit = pnl.amount >= 0;

  return (
    <LinearGradient colors={Colors.backgroundGradient} style={styles.container}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerSection}>
          <Text style={styles.label}>Total Equity</Text>
          <View style={styles.balanceRow}>
            <Text style={styles.totalValue}>
              {hideBalance
                ? "*******"
                : `$${totalEquity.toLocaleString(undefined, { maximumFractionDigits: 2 })}`}
            </Text>
            <TouchableOpacity
              onPress={() => setHideBalance(!hideBalance)}
              style={{ marginLeft: 10 }}
            >
              <Ionicons
                name={hideBalance ? "eye-off" : "eye"}
                size={20}
                color={Colors.textDim}
              />
            </TouchableOpacity>
          </View>

          <View
            style={[
              styles.pnlChip,
              {
                backgroundColor: isProfit
                  ? "rgba(38, 166, 154, 0.15)"
                  : "rgba(239, 83, 80, 0.15)",
              },
            ]}
          >
            <Text
              style={[
                styles.pnlText,
                { color: isProfit ? Colors.up : Colors.down },
              ]}
            >
              Today {isProfit ? "+" : ""}
              {pnl.amount.toLocaleString(undefined, {
                maximumFractionDigits: 2,
              })}{" "}
              ({pnl.percent.toFixed(2)}%)
            </Text>
          </View>
        </View>

        <View style={styles.actionGrid}>
          <ActionButton
            icon="add"
            label="Deposit"
            onPress={() => setIsAddFundVisible(true)}
            color={Colors.up}
          />
          <ActionButton
            icon="arrow-up"
            label="Withdraw"
            onPress={() => Alert.alert("Withdraw", "Function coming soon")}
          />
          <ActionButton
            icon="swap-horizontal"
            label="Transfer"
            onPress={() => Alert.alert("Transfer", "Spot <-> Futures")}
          />
          <ActionButton
            icon="time"
            label="History"
            onPress={() => setHistoryVisible(true)}
          />
        </View>

        <View style={styles.sectionContainer}>
          <Text style={styles.sectionTitle}>Portfolio Allocation</Text>
          <BlurView intensity={20} tint="dark" style={styles.card}>
            <View style={styles.allocationBar}>
              {portfolio.map((asset, index) => (
                <View
                  key={asset.id || index}
                  style={{
                    flex: asset.percent > 0 ? asset.percent : 0,
                    backgroundColor: asset.color,
                    height: "100%",
                  }}
                />
              ))}
              {portfolio.length === 0 && (
                <View
                  style={{ flex: 1, backgroundColor: Colors.glassBorder }}
                />
              )}
            </View>

            {portfolio.map((asset, index) => (
              <View key={asset.id || index}>
                <AssetRow
                  icon={asset.icon}
                  name={asset.name}
                  amount={asset.amount}
                  value={asset.value}
                  symbol={asset.symbol}
                  percent={asset.percent}
                  color={asset.color}
                  isFutures={asset.isFutures}
                />
                {index < portfolio.length - 1 && (
                  <View style={styles.divider} />
                )}
              </View>
            ))}
            {portfolio.length === 0 && (
              <Text
                style={{
                  color: Colors.textDim,
                  textAlign: "center",
                  marginVertical: 10,
                  fontSize: 12,
                }}
              >
                No assets to display.
              </Text>
            )}
          </BlurView>
        </View>

        <View style={styles.sectionContainer}>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 10,
            }}
          >
            <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>
              Last Position Result
            </Text>
            <TouchableOpacity onPress={() => setHistoryVisible(true)}>
              <Text
                style={{
                  color: Colors.up,
                  fontSize: 12,
                  fontWeight: "bold",
                  marginRight: 4,
                }}
              >
                View All
              </Text>
            </TouchableOpacity>
          </View>

          <BlurView intensity={20} tint="dark" style={styles.card}>
            {positionHistory.length > 0 ? (
              <PositionHistoryItem item={positionHistory[0]} />
            ) : (
              <Text
                style={{
                  color: Colors.textDim,
                  textAlign: "center",
                  padding: 20,
                  fontSize: 12,
                }}
              >
                No position history yet.
              </Text>
            )}
          </BlurView>
        </View>

        <TouchableOpacity style={styles.resetBtn} onPress={handleReset}>
          <Text style={styles.resetText}>Reset Account Data</Text>
        </TouchableOpacity>
      </ScrollView>

      <AddFundModal
        visible={isAddFundVisible}
        onClose={() => setIsAddFundVisible(false)}
        onUpdate={loadData}
      />

      <Modal
        visible={historyVisible}
        animationType="slide"
        transparent={false}
        onRequestClose={() => setHistoryVisible(false)}
      >
        <LinearGradient
          colors={Colors.backgroundGradient}
          style={styles.fullModal}
        >
          <SafeAreaView style={{ flex: 1, marginTop: 10 }}>
            <View style={styles.modalHeader}>
              <TouchableOpacity
                onPress={() => setHistoryVisible(false)}
                style={styles.closeModalBtn}
              >
                <Ionicons name="chevron-back" size={24} color="#fff" />
              </TouchableOpacity>
              <Text style={styles.modalTitle}>Position History</Text>
              <View style={{ width: 40 }} />
            </View>

            <FlatList
              data={positionHistory}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{
                paddingHorizontal: 20,
                paddingBottom: 40,
              }}
              renderItem={({ item }) => (
                <View
                  style={{
                    borderBottomWidth: 1,
                    borderBottomColor: "rgba(255,255,255,0.05)",
                  }}
                >
                  <PositionHistoryItem item={item} />
                </View>
              )}
              ListEmptyComponent={
                <Text
                  style={{
                    color: Colors.textDim,
                    textAlign: "center",
                    marginTop: 50,
                  }}
                >
                  No position records found.
                </Text>
              }
            />
          </SafeAreaView>
        </LinearGradient>
      </Modal>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 70, paddingHorizontal: 20 },
  headerSection: { alignItems: "flex-start", marginBottom: 30 },
  label: {
    color: Colors.textDim,
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 5,
  },
  balanceRow: { flexDirection: "row", alignItems: "center" },
  totalValue: { color: "#fff", fontSize: 36, fontWeight: "bold" },
  pnlChip: {
    marginTop: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  pnlText: { fontSize: 13, fontWeight: "bold" },
  actionGrid: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 30,
  },
  actionBtn: { alignItems: "center", width: width / 4.5 },
  actionIconCircle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "rgba(255,255,255,0.1)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8,
  },
  actionLabel: { color: Colors.textDim, fontSize: 12 },
  sectionContainer: { marginBottom: 25 },
  sectionTitle: {
    color: Colors.textDim,
    fontSize: 14,
    fontWeight: "bold",
    marginBottom: 10,
    marginLeft: 4,
  },
  card: {
    borderRadius: 16,
    padding: 16,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    overflow: "hidden",
  },
  allocationBar: {
    flexDirection: "row",
    height: 8,
    width: "100%",
    marginBottom: 20,
    borderRadius: 4,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  assetRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
  },
  assetInfo: { flexDirection: "row", alignItems: "center", gap: 10 },
  assetIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  assetName: { color: "#fff", fontWeight: "bold", fontSize: 14 },
  assetPercent: { color: Colors.textDim, fontSize: 12 },
  assetValue: { color: "#fff", fontWeight: "600", fontSize: 14 },
  assetAmount: { color: Colors.textDim, fontSize: 12 },
  divider: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.05)",
    marginVertical: 4,
  },
  txItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
  },
  txLeft: { flexDirection: "row", alignItems: "center", gap: 12 },
  txIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  txType: { color: "#fff", fontWeight: "bold", fontSize: 14 },
  historyTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  sideBadge: {
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  sideBadgeText: {
    fontSize: 10,
    fontWeight: "bold",
  },
  historyType: {
    color: Colors.textDim,
    fontSize: 11,
    fontWeight: "600",
  },
  txDate: { color: Colors.textDim, fontSize: 11, marginTop: 2 },
  priceRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 6,
  },
  priceLabel: {
    color: Colors.textDim,
    fontSize: 10,
  },
  priceValue: {
    color: "#fff",
    fontWeight: "600",
  },
  txAmount: { fontWeight: "bold", fontSize: 14 },
  txStatus: {
    color: Colors.textDim,
    fontSize: 11,
    textAlign: "right",
    marginTop: 2,
  },
  resetBtn: {
    alignItems: "center",
    paddingVertical: 15,
    marginTop: 10,
    borderTopWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  resetText: {
    color: Colors.textDim,
    fontSize: 12,
    textDecorationLine: "underline",
  },
  fullModal: { flex: 1 },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.1)",
  },
  closeModalBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  modalTitle: { color: "#fff", fontSize: 18, fontWeight: "bold" },
});