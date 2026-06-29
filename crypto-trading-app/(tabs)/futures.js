import { FontAwesome5, Ionicons } from "@expo/vector-icons";
import Slider from "@react-native-community/slider";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect } from "expo-router";
import React, { useCallback, useEffect, useState, useRef } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Modal,
  ScrollView,
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

const LEVERAGE_PRESETS = [10, 25, 30, 50, 75, 125];

const calcPositionDetails = (pos, currentPrice) => {
  if (!pos || !currentPrice)
    return {
      pnl: 0,
      roe: 0,
      size: 0,
      fee: 0,
      net: 0,
      liqPrice: 0,
      marginRatio: 0,
    };

  const positionType = pos.type || pos.side || "LONG";

  const diff =
    positionType === "LONG"
      ? currentPrice - pos.entryPrice
      : pos.entryPrice - currentPrice;
  const roe = (diff / pos.entryPrice) * pos.leverage * 100;
  const pnl = pos.margin * (roe / 100);

  const coinSize = pos.amount || pos.size || 0;
  const sizeValue = coinSize * currentPrice;
  const fee = sizeValue * 0.0004;
  const net = pnl - fee;

  const liqPrice =
    positionType === "LONG"
      ? pos.entryPrice * (1 - 1 / pos.leverage)
      : pos.entryPrice * (1 + 1 / pos.leverage);

  const currentMargin = pos.margin + pnl;
  const marginRatio = sizeValue > 0 ? (currentMargin / sizeValue) * 100 : 0;

  return { pnl, roe, size: sizeValue, fee, net, liqPrice, marginRatio };
};

const OrderRow = React.memo(({ price, amount, width, type, precision }) => {
  const widthAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(widthAnim, {
      toValue: width,
      duration: 300, 
      useNativeDriver: false,
    }).start();
  }, [width]);

  return (
    <View style={styles.orderRow}>
      <Text style={[styles.bookPrice, { color: type === 'ask' ? Colors.down : Colors.up }]}>
        {price.toFixed(precision)} 
      </Text>
      <Text style={styles.bookAmt}>{amount.toFixed(3)}</Text>
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
          precision={precision}
        />
      ))}

      <View style={styles.currentPriceRow}>
        <Text style={styles.centerPrice}>
            {currentPrice > 0 ? currentPrice.toLocaleString(undefined, { minimumFractionDigits: precision, maximumFractionDigits: precision }) : "---"}
        </Text>
      </View>

      {bids.map((item, i) => (
        <OrderRow
          key={`bid-${i}`}
          price={item.price}
          amount={item.amount}
          width={item.width}
          type="bid"
          precision={precision}
        />
      ))}
    </>
  );
});

const PositionCard = React.memo(({ pos, currentPrice, onPressClose, isLoading }) => {
  if (isLoading) {
    return (
      <BlurView intensity={20} tint="dark" style={styles.emptyCard}>
        <ActivityIndicator size="small" color={Colors.textDim} />
        <Text style={{ color: Colors.textDim, marginTop: 8, fontSize: 12 }}>
          Updating prices...
        </Text>
      </BlurView>
    );
  }

  const details = calcPositionDetails(pos, currentPrice);
  const isProfit = details.pnl >= 0;
  const color = isProfit ? Colors.up : Colors.down;
  const positionType = pos.type || pos.side || "LONG";

  return (
    <BlurView intensity={20} tint="dark" style={styles.positionCard}>
      <View style={styles.posHeader}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <View
            style={[
              styles.sideTag,
              {
                backgroundColor:
                  positionType === "LONG"
                    ? "rgba(38, 166, 154, 0.2)"
                    : "rgba(239, 83, 80, 0.2)",
              },
            ]}
          >
            <Text
              style={{
                color: positionType === "LONG" ? Colors.up : Colors.down,
                fontWeight: "bold",
                fontSize: 10,
              }}
            >
              {positionType === "LONG" ? "B" : "S"}
            </Text>
          </View>
          <Text style={styles.posSymbol}>{pos.symbol}</Text>
          <Text style={styles.posLev}>x{pos.leverage}</Text>
        </View>
        <TouchableOpacity
          onPress={() => onPressClose(pos)}
          style={styles.closeBtn}
        >
          <Text style={styles.closeText}>Close</Text>
        </TouchableOpacity>
      </View>

      <View style={{ marginBottom: 10 }}>
        <Text style={styles.dataLabel}>Unrealized PnL</Text>
        <Text style={[styles.pnlBig, { color }]}>
          {isProfit ? "+" : ""}
          {details.pnl.toFixed(2)} ({details.roe.toFixed(2)}%)
        </Text>
      </View>

      <View style={styles.gridRow}>
        <View style={styles.gridItem}>
          <Text style={styles.dataLabel}>Size</Text>
          <Text style={styles.dataValue}>${details.size.toFixed(0)}</Text>
        </View>
        <View style={[styles.gridItem, { alignItems: "center" }]}>
          <Text style={styles.dataLabel}>Margin Ratio</Text>
          <Text style={styles.dataValue}>
            {details.marginRatio.toFixed(1)}%
          </Text>
        </View>
        <View style={[styles.gridItem, { alignItems: "flex-end" }]}>
          <Text style={styles.dataLabel}>Margin</Text>
          <Text style={styles.dataValue}>${pos.margin.toFixed(0)}</Text>
        </View>
      </View>
      <View style={[styles.gridRow, { marginTop: 6 }]}>
        <View style={styles.gridItem}>
          <Text style={styles.dataLabel}>Entry</Text>
          <Text style={styles.dataValue}>
            {pos.entryPrice.toLocaleString()}
          </Text>
        </View>
        <View style={[styles.gridItem, { alignItems: "center" }]}>
          <Text style={styles.dataLabel}>Mark</Text>
          <Text style={styles.dataValue}>
            {currentPrice.toLocaleString()}
          </Text>
        </View>
        <View style={[styles.gridItem, { alignItems: "flex-end" }]}>
          <Text style={styles.dataLabel}>Liq. Price</Text>
          <Text style={[styles.dataValue, { color: Colors.down }]}>
            {details.liqPrice.toFixed(1)}
          </Text>
        </View>
      </View>
    </BlurView>
  );
});

export default function FuturesScreen() {
  const activeSymbol = "BTCUSDT";
  const displaySymbol = activeSymbol.replace("USDT", "") + "/USDT";

  const activeCoin = COIN_LIST[0];
  const precision = 2;

  const { price: currentPrice, change: priceChange } = useBinanceTicker(
    activeSymbol,
    "FUTURES",
  );

  useEffect(() => {
    console.log('[FuturesScreen] ticker update', {
      activeSymbol,
      currentPrice,
      priceChange,
      isLoading: !currentPrice || currentPrice === 0,
    });
  }, [activeSymbol, currentPrice, priceChange]);

  const isLoading = !currentPrice || currentPrice === 0;

  const [balance, setBalance] = useState(0);
  const [positions, setPositions] = useState([]);
  const [leverage, setLeverage] = useState(10);
  const [amountPercent, setAmountPercent] = useState(0);
  const [side, setSide] = useState("LONG");

  const [levModalVisible, setLevModalVisible] = useState(false);
  const [closeModalVisible, setCloseModalVisible] = useState(false);
  const [targetPosition, setTargetPosition] = useState(null);
  const closeSymbol = targetPosition?.symbol || activeSymbol;
  const { price: closePrice } = useBinanceTicker(closeSymbol, "FUTURES");

  const loadData = useCallback(async () => {
    const bal = await Storage.getBalance();
    const pos = await Storage.getPositions();
    setBalance(bal);
    setPositions(pos);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
      return undefined;
    }, [loadData]),
  );

  const handleOrder = async () => {
    if (isLoading) return;

    const margin = balance * (amountPercent / 100);
    if (margin < 10) return Alert.alert("알림", "최소 주문 금액은 $10입니다.");

    const newPos = {
      symbol: activeSymbol,
      side: side,
      type: side,
      leverage,
      entryPrice: currentPrice,
      margin,
      amount: (margin * leverage) / currentPrice,
      size: (margin * leverage) / currentPrice,
      timestamp: Date.now(),
    };

    const success = await Storage.openPosition(newPos);

    if (success) {
      loadData();
      setAmountPercent(0);
      Alert.alert("주문 완료", `${activeSymbol} ${side} 포지션 진입 성공`);
    } else {
      Alert.alert("주문 실패", "잔고가 부족하거나 오류가 발생했습니다.");
    }
  };

  const onPressClose = useCallback((pos) => {
    setTargetPosition(pos);
    setCloseModalVisible(true);
  }, []);

  const confirmClose = async () => {
    if (!targetPosition) return;

    const settlePrice = closePrice > 0 ? closePrice : currentPrice;
    const { net } = calcPositionDetails(targetPosition, settlePrice);
    const result = await Storage.closePosition(targetPosition.id, net, settlePrice);

    if (result) {
      loadData();
      const returnAmount = targetPosition.margin + net;
      Alert.alert(
        net >= 0 ? "익절 완료" : "손절 완료",
        `반환 금액: $${returnAmount.toFixed(2)}\n(순손익: $${net.toFixed(2)})`,
      );
      setCloseModalVisible(false);
      setTargetPosition(null);
    } else {
      Alert.alert("오류", "포지션 청산 중 문제가 발생했습니다.");
    }
  };

  return (
    <LinearGradient colors={Colors.backgroundGradient} style={styles.container}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 20 }}>
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
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
              >
                <Text style={styles.symbol}>{displaySymbol}</Text>
              </View>
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 5 }}
              >
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
              ${balance.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </Text>
          </View>
        </View>

        <View style={styles.contentContainer}>
        <BlurView intensity={20} tint="dark" style={styles.controlPanel}>
          <View style={styles.tabContainer}>
            <TouchableOpacity
              onPress={() => setSide("LONG")}
              style={[styles.tab, side === "LONG" && styles.activeTabLong]}
            >
              <Text
                style={[styles.tabText, side === "LONG" && { color: "#fff" }]}
              >
                Long
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setSide("SHORT")}
              style={[styles.tab, side === "SHORT" && styles.activeTabShort]}
            >
              <Text
                style={[styles.tabText, side === "SHORT" && { color: "#fff" }]}
              >
                Short
              </Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={styles.leverageBtn}
            onPress={() => setLevModalVisible(true)}
          >
            <Text style={styles.leverageLabel}>Cross {leverage}x</Text>
            <Ionicons name="settings-sharp" size={12} color={Colors.textDim} />
          </TouchableOpacity>

          <View style={styles.infoCard}>
            <Text style={styles.smallLabel}>Market Price</Text>
            <Text style={styles.marketPriceText}>
              {isLoading ? "Loading..." : `$${currentPrice.toLocaleString(undefined, {minimumFractionDigits: precision})}`}
            </Text>
          </View>

          <View style={styles.sliderCard}>
            <View style={styles.rowBetween}>
              <Text style={styles.smallLabel}>Margin (USDT)</Text>
              <Text style={styles.valueText}>
                ${((balance * amountPercent) / 100).toFixed(0)}
              </Text>
            </View>
            <Slider
              style={{ width: "100%", height: 25 }}
              minimumValue={0}
              maximumValue={100}
              step={1}
              value={amountPercent}
              onValueChange={setAmountPercent}
              minimumTrackTintColor={side === "LONG" ? Colors.up : Colors.down}
              maximumTrackTintColor="rgba(255,255,255,0.1)"
              thumbTintColor="#fff"
              disabled={isLoading}
            />
            <View style={[styles.rowBetween, { marginTop: 4 }]}>
              <Text style={styles.smallLabel}>Size (x{leverage})</Text>
              <Text style={styles.infoValue}>
                {isLoading
                  ? "---"
                  : `$${(balance * (amountPercent / 100) * leverage).toFixed(0)}`}
              </Text>
            </View>
          </View>

          <TouchableOpacity
            onPress={handleOrder}
            style={{ marginTop: 10 }}
            disabled={isLoading}
          >
            <LinearGradient
              colors={
                side === "LONG"
                  ? [Colors.up, "#2e7d32"]
                  : [Colors.down, "#c62828"]
              }
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={[styles.actionBtn, { opacity: isLoading ? 0.5 : 1 }]}
            >
              <Text style={styles.btnText}>
                {isLoading
                  ? "Please Wait"
                  : side === "LONG"
                    ? "Buy / Long"
                    : "Sell / Short"}
              </Text>
            </LinearGradient>
          </TouchableOpacity>
        </BlurView>

        <View style={styles.bookPanel}>
          <Text style={styles.sectionTitle}>Order Book</Text>
          <OrderBook 
            symbol={activeSymbol} 
            currentPrice={currentPrice} 
            type="FUTURES" 
            precision={precision} 
          />
        </View>
      </View>

      <View style={{ paddingHorizontal: 15, marginTop: 0 }}>
        <Text style={styles.sectionTitle}>
          My Positions (
          {positions.filter((p) => p.symbol === activeSymbol).length})
        </Text>

        {positions
          .filter((p) => p.symbol === activeSymbol)
          .map((pos) => (
            <PositionCard
              key={pos.id}
              pos={pos}
              currentPrice={currentPrice}
              onPressClose={onPressClose}
              isLoading={isLoading}
            />
          ))}

        {positions.filter((p) => p.symbol === activeSymbol).length === 0 && (
          <BlurView intensity={20} tint="dark" style={styles.emptyCard}>
            <Ionicons
              name="documents-outline"
              size={30}
              color={Colors.textDim}
            />
            <Text
              style={{ color: Colors.textDim, marginTop: 10, fontSize: 12 }}
            >
              No open positions for {activeSymbol}
            </Text>
          </BlurView>
        )}
      </View>
      </ScrollView>

      <Modal
        animationType="fade"
        transparent={true}
        visible={levModalVisible}
        onRequestClose={() => setLevModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <BlurView intensity={50} tint="dark" style={styles.modalContent}>
            <Text style={styles.modalTitle}>Adjust Leverage</Text>
            <Text style={styles.levDisplay}>{leverage}x</Text>
            <Slider
              style={{ width: "100%", height: 40, marginVertical: 10 }}
              minimumValue={1}
              maximumValue={125}
              step={1}
              value={leverage}
              onValueChange={setLeverage}
              minimumTrackTintColor={Colors.up}
              thumbTintColor="#fff"
            />
            <View style={styles.levPresetWrap}>
              {LEVERAGE_PRESETS.map((item) => (
                <TouchableOpacity
                  key={item}
                  onPress={() => setLeverage(item)}
                  style={[
                    styles.levPresetBtn,
                    leverage === item && styles.levPresetBtnActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.levPresetText,
                      leverage === item && styles.levPresetTextActive,
                    ]}
                  >
                    {item}배
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity
              style={styles.modalBtn}
              onPress={() => setLevModalVisible(false)}
            >
              <Text style={styles.modalBtnText}>Confirm</Text>
            </TouchableOpacity>
          </BlurView>
        </View>
      </Modal>

      <Modal
        animationType="slide"
        transparent={true}
        visible={closeModalVisible}
        onRequestClose={() => setCloseModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <BlurView intensity={80} tint="dark" style={styles.modalContent}>
            <Text style={styles.modalTitle}>Close Position</Text>
            {targetPosition &&
              (() => {
                if (isLoading)
                  return (
                    <Text style={{ color: "#fff" }}>Loading price...</Text>
                  );
                const settlePrice = closePrice > 0 ? closePrice : currentPrice;
                const d = calcPositionDetails(targetPosition, settlePrice);
                return (
                  <View style={{ width: "100%" }}>
                    <View style={styles.confirmRow}>
                      <Text style={styles.confirmLabel}>Position Size</Text>
                      <Text style={styles.confirmValue}>
                        ${d.size.toFixed(2)}
                      </Text>
                    </View>
                    <View style={styles.confirmRow}>
                      <Text style={styles.confirmLabel}>Unrealized PnL</Text>
                      <Text
                        style={[
                          styles.confirmValue,
                          { color: d.pnl >= 0 ? Colors.up : Colors.down },
                        ]}
                      >
                        ${d.pnl.toFixed(2)}
                      </Text>
                    </View>
                    <View style={styles.confirmRow}>
                      <Text style={styles.confirmLabel}>Est. Fee (0.04%)</Text>
                      <Text style={styles.confirmValue}>
                        -${d.fee.toFixed(2)}
                      </Text>
                    </View>
                    <View style={styles.divider} />
                    <View style={styles.confirmRow}>
                      <Text
                        style={[
                          styles.confirmLabel,
                          { color: "#fff", fontWeight: "bold" },
                        ]}
                      >
                        Net Profit
                      </Text>
                      <Text
                        style={[
                          styles.confirmValue,
                          {
                            fontSize: 16,
                            fontWeight: "bold",
                            color: d.net >= 0 ? Colors.up : Colors.down,
                          },
                        ]}
                      >
                        ${d.net.toFixed(2)}
                      </Text>
                    </View>
                    <View
                      style={{ flexDirection: "row", marginTop: 20, gap: 10 }}
                    >
                      <TouchableOpacity
                        style={[
                          styles.modalBtn,
                          {
                            backgroundColor: "rgba(255,255,255,0.1)",
                            flex: 1,
                          },
                        ]}
                        onPress={() => setCloseModalVisible(false)}
                      >
                        <Text style={styles.modalBtnText}>Cancel</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[
                          styles.modalBtn,
                          { backgroundColor: Colors.up, flex: 1 },
                        ]}
                        onPress={confirmClose}
                      >
                        <Text style={styles.modalBtnText}>Confirm Close</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })()}
          </BlurView>
        </View>
      </Modal>

    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    marginBottom: 15,
    paddingTop: 50,
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
  price: { fontSize: 16, fontWeight: "bold" },
  headerRight: { alignItems: "flex-end" },
  label: { color: Colors.textDim, fontSize: 11 },
  balance: { color: "#fff", fontSize: 14, fontWeight: "600" },
  contentContainer: {
    flexDirection: "row",
    paddingHorizontal: 15,
    marginBottom: 15,
    minHeight: 380,
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
    marginBottom: 10,
    overflow: "hidden",
  },
  tab: { flex: 1, alignItems: "center", paddingVertical: 8, borderRadius: 8 },
  activeTabLong: { backgroundColor: "rgba(38, 166, 154, 0.2)" },
  activeTabShort: { backgroundColor: "rgba(239, 83, 80, 0.2)" },
  tabText: { color: Colors.textDim, fontSize: 11, fontWeight: "bold" },
  leverageBtn: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 8,
    padding: 8,
    marginBottom: 10,
    overflow: "hidden",
  },
  leverageLabel: { color: "#fff", fontSize: 12, fontWeight: "bold" },
  infoCard: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    overflow: "hidden",
  },
  marketPriceText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "bold",
    marginTop: 4,
    textAlign: "center",
  },
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
  levPresetWrap: {
    width: "100%",
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    marginTop: 2,
    rowGap: 8,
  },
  levPresetBtn: {
    width: "31%",
    borderRadius: 8,
    paddingVertical: 7,
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  levPresetBtnActive: {
    backgroundColor: "rgba(38, 166, 154, 0.2)",
    borderColor: Colors.up,
  },
  levPresetText: {
    color: Colors.textDim,
    fontSize: 11,
    fontWeight: "600",
  },
  levPresetTextActive: {
    color: "#fff",
    fontWeight: "bold",
  },
  smallLabel: { color: Colors.textDim, fontSize: 10 },
  valueText: { color: "#fff", fontSize: 12, fontWeight: "bold" },
  infoValue: { color: Colors.up, fontSize: 11, fontWeight: "bold" },
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
  sideTag: {
    width: 16,
    height: 16,
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 6,
  },
  posSymbol: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 13,
    marginRight: 6,
  },
  posLev: { color: Colors.textDim, fontSize: 12 },
  closeBtn: {
    backgroundColor: "rgba(255,255,255,0.1)",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  closeText: { color: "#fff", fontSize: 10, fontWeight: "bold" },
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
  modalContent: {
    width: 300,
    borderRadius: 24,
    padding: 25,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    alignItems: "center",
  },
  coinModalContent: {
    width: 320,
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    alignItems: "center",
    maxHeight: "60%",
  },
  modalTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 15,
  },
  levDisplay: {
    fontSize: 32,
    fontWeight: "bold",
    color: Colors.up,
    marginBottom: 10,
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
  confirmRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%",
    marginBottom: 8,
  },
  confirmLabel: { color: Colors.textDim, fontSize: 14 },
  confirmValue: { color: "#fff", fontSize: 14, fontWeight: "600" },
  divider: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.1)",
    width: "100%",
    marginVertical: 10,
  },
  coinItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 10,
    width: "100%",
    borderRadius: 12,
  },
  coinName: { color: "#fff", fontSize: 16, fontWeight: "bold", flex: 1 },
  coinSymbol: { color: Colors.textDim, fontSize: 14 },
});