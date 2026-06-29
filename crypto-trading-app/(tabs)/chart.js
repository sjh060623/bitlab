import React, { useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { WebView } from "react-native-webview";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const SYMBOL_OPTIONS = [
	{ label: "BTC/USDT", value: "BTCUSDT" },
	{ label: "ETH/USDT", value: "ETHUSDT" },
	{ label: "BNB/USDT", value: "BNBUSDT" },
	{ label: "SOL/USDT", value: "SOLUSDT" },
];

const TIMEFRAME_OPTIONS = [
	{ label: "1m", value: "1m" },
	{ label: "3m", value: "3m" },
	{ label: "5m", value: "5m" },
	{ label: "15m", value: "15m" },
	{ label: "4h", value: "4h" },
	{ label: "1D", value: "1d" },
];

const INDICATOR_META = {
	macd: { label: "MACD" },
	rsi: { label: "RSI" },
	bb: { label: "BOLL" },
};

const buildLightweightChartHtml = ({ symbol, interval, indicators }) => {
	const config = { symbol, interval, indicators };
	return `
<!DOCTYPE html>
<html>
	<head>
		<meta charset="UTF-8" />
		<meta
			name="viewport"
			content="width=device-width, initial-scale=1.0, maximum-scale=1.0"
		/>
		<script src="https://unpkg.com/lightweight-charts/dist/lightweight-charts.standalone.production.js"></script>
		<style>
			html, body {
				margin: 0;
				padding: 0;
				width: 100%;
				height: 100%;
				background: #0b0e11;
				overflow: hidden;
				touch-action: pan-x pan-y pinch-zoom;
				font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
			}
			#root {
				width: 100%;
				height: 100%;
				display: flex;
				flex-direction: column;
				background: #0b0e11;
				flex: 1;
			}
			.pane {
				width: 100%;
				position: relative;
				flex: 1;
				min-height: 0;
			}
			#main-pane {
				flex: 0.6;
			}
			#macd-pane {
				flex: 0.2;
				display: none;
			}
			#rsi-pane {
				flex: 0.2;
				display: none;
			}
			#status {
				position: absolute;
				top: 12px;
				left: 12px;
				padding: 4px 8px;
				font-size: 11px;
				border-radius: 6px;
				background: rgba(19, 23, 34, 0.9);
				color: #b7bdc6;
				z-index: 20;
				border: 1px solid #1e2329;
			}
			.chart {
				width: 100%;
				height: 100%;
			}
				width: 100%;
				height: 100%;
			}
		</style>
	</head>
	<body>
		<div id="root">
			<div id="main-pane" class="pane">
				<div id="status"></div>
				<div id="main-chart" class="chart"></div>
			</div>
			<div id="macd-pane" class="pane"><div id="macd-chart" class="chart"></div></div>
			<div id="rsi-pane" class="pane"><div id="rsi-chart" class="chart"></div></div>
		</div>
		<script>
			const config = ${JSON.stringify(config)};
			const colors = {
				bg: "#0B0E11",
				grid: "#1E2329",
				text: "#B7BDC6",
				up: "#0ECB81",
				down: "#F6465D",
				yellow: "#F0B90B",
				blue: "#4A90E2",
				gray: "#808A9D",
			};

			const root = document.getElementById("root");
			const mainPane = document.getElementById("main-pane");
			const macdPane = document.getElementById("macd-pane");
			const rsiPane = document.getElementById("rsi-pane");
			const statusEl = document.getElementById("status");

			function applyPaneHeights() {
				const hasMacd = !!config.indicators.macd;
				const hasRsi = !!config.indicators.rsi;
				const extra = (hasMacd ? 1 : 0) + (hasRsi ? 1 : 0);

				if (extra === 0) {
					mainPane.style.flex = "1";
					macdPane.style.display = "none";
					rsiPane.style.display = "none";
				} else if (extra === 1) {
					mainPane.style.flex = "0.66";
					macdPane.style.flex = hasMacd ? "0.34" : "0";
					rsiPane.style.flex = hasRsi ? "0.34" : "0";
					if (hasMacd) {
						macdPane.style.display = "flex";
						rsiPane.style.display = "none";
					} else {
						macdPane.style.display = "none";
						rsiPane.style.display = "flex";
					}
				} else {
					mainPane.style.flex = "0.5";
					macdPane.style.display = hasMacd ? "flex" : "none";
					rsiPane.style.display = hasRsi ? "flex" : "none";
					macdPane.style.flex = "0.25";
					rsiPane.style.flex = "0.25";
				}
			}

			function chartOptions() {
				return {
					layout: {
						background: { color: colors.bg },
						textColor: colors.text,
					},
					grid: {
						vertLines: { color: colors.grid },
						horzLines: { color: colors.grid },
					},
					rightPriceScale: {
						borderColor: colors.grid,
					},
					timeScale: {
						borderColor: colors.grid,
						timeVisible: true,
						secondsVisible: false,
					},
					crosshair: {
						horzLine: { color: "#6A7485", labelBackgroundColor: "#2B3139" },
						vertLine: { color: "#6A7485", labelBackgroundColor: "#2B3139" },
					},
					handleScroll: true,
					handleScale: true,
				};
			}

			function calcEMA(values, period) {
				const k = 2 / (period + 1);
				const out = [];
				let prev = values[0] ?? 0;
				for (let i = 0; i < values.length; i++) {
					if (i === 0) {
						out.push(values[0]);
						continue;
					}
					prev = values[i] * k + prev * (1 - k);
					out.push(prev);
				}
				return out;
			}

			function calcMACD(closes, times) {
				if (closes.length < 35) return { macd: [], signal: [], hist: [] };
				const ema12 = calcEMA(closes, 12);
				const ema26 = calcEMA(closes, 26);
				const macdVals = closes.map((_, i) => ema12[i] - ema26[i]);
				const signalVals = calcEMA(macdVals, 9);
				const histVals = macdVals.map((v, i) => v - signalVals[i]);

				return {
					macd: times.map((t, i) => ({ time: t, value: macdVals[i] })),
					signal: times.map((t, i) => ({ time: t, value: signalVals[i] })),
					hist: times.map((t, i) => ({ time: t, value: histVals[i] })),
				};
			}

			function calcRSI(closes, times, period = 14) {
				if (closes.length <= period) return [];
				const rsi = [];
				let gain = 0;
				let loss = 0;

				for (let i = 1; i <= period; i++) {
					const diff = closes[i] - closes[i - 1];
					if (diff >= 0) gain += diff;
					else loss -= diff;
				}

				let avgGain = gain / period;
				let avgLoss = loss / period;
				let rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
				rsi[period] = 100 - 100 / (1 + rs);

				for (let i = period + 1; i < closes.length; i++) {
					const diff = closes[i] - closes[i - 1];
					const up = diff > 0 ? diff : 0;
					const down = diff < 0 ? -diff : 0;
					avgGain = (avgGain * (period - 1) + up) / period;
					avgLoss = (avgLoss * (period - 1) + down) / period;
					rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
					rsi[i] = 100 - 100 / (1 + rs);
				}

				return times
					.map((t, i) => ({ time: t, value: rsi[i] }))
					.filter((x) => typeof x.value === "number" && Number.isFinite(x.value));
			}

			function calcBollinger(closes, times, period = 20, mult = 2) {
				if (closes.length < period) return { upper: [], mid: [], lower: [] };
				const upper = [];
				const mid = [];
				const lower = [];

				for (let i = period - 1; i < closes.length; i++) {
					const slice = closes.slice(i - period + 1, i + 1);
					const mean = slice.reduce((a, b) => a + b, 0) / period;
					const variance =
						slice.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / period;
					const stdev = Math.sqrt(variance);
					const t = times[i];
					upper.push({ time: t, value: mean + stdev * mult });
					mid.push({ time: t, value: mean });
					lower.push({ time: t, value: mean - stdev * mult });
				}

				return { upper, mid, lower };
			}

			function resizeChart(chart, container) {
				const width = container.clientWidth;
				const height = container.clientHeight;
				if (width > 0 && height > 0) {
					chart.applyOptions({
						width: width,
						height: height,
					});
				}
			}

			function resizeAllCharts() {
				resizeChart(mainChart, mainContainer);
				if (macdChart && macdPane.style.display !== "none") {
					resizeChart(macdChart, macdContainer);
				}
				if (rsiChart && rsiPane.style.display !== "none") {
					resizeChart(rsiChart, rsiContainer);
				}
			}

			function syncTimeScale(master, slaves) {
				let isSyncing = false;
				master.timeScale().subscribeVisibleLogicalRangeChange((range) => {
					if (!range || isSyncing) return;
					isSyncing = true;
					slaves.forEach((chart) => chart.timeScale().setVisibleLogicalRange(range));
					isSyncing = false;
				});
			}

			function toCandle(raw) {
				return {
					time: Math.floor(raw[0] / 1000),
					open: Number(raw[1]),
					high: Number(raw[2]),
					low: Number(raw[3]),
					close: Number(raw[4]),
					volume: Number(raw[5]),
				};
			}

			applyPaneHeights();

			const mainContainer = document.getElementById("main-chart");
			const macdContainer = document.getElementById("macd-chart");
			const rsiContainer = document.getElementById("rsi-chart");

			const mainChart = LightweightCharts.createChart(mainContainer, {
				...chartOptions(),
				width: mainContainer.clientWidth || 400,
				height: mainContainer.clientHeight || 300,
			});
			
			const candleSeries = mainChart.addCandlestickSeries({
				upColor: colors.up,
				downColor: colors.down,
				borderUpColor: colors.up,
				borderDownColor: colors.down,
				wickUpColor: colors.up,
				wickDownColor: colors.down,
				priceLineColor: colors.yellow,
			});

			const volumeSeries = mainChart.addHistogramSeries({
				priceScaleId: "",
				priceFormat: { type: "volume" },
				scaleMargins: { top: 0.82, bottom: 0 },
			});

			let bbUpper = null;
			let bbMid = null;
			let bbLower = null;

			if (config.indicators.bb) {
				bbUpper = mainChart.addLineSeries({ color: colors.yellow, lineWidth: 1, priceLineVisible: false });
				bbMid = mainChart.addLineSeries({ color: colors.gray, lineWidth: 1, priceLineVisible: false });
				bbLower = mainChart.addLineSeries({ color: colors.yellow, lineWidth: 1, priceLineVisible: false });
			}

			let macdChart = null;
			let macdSeries = null;
			let macdSignalSeries = null;
			let macdHistSeries = null;

			if (config.indicators.macd) {
				macdChart = LightweightCharts.createChart(macdContainer, {
					...chartOptions(),
					width: macdContainer.clientWidth || 400,
					height: macdContainer.clientHeight || 150,
				});
				macdSeries = macdChart.addLineSeries({ color: colors.yellow, lineWidth: 1, priceLineVisible: false });
				macdSignalSeries = macdChart.addLineSeries({ color: colors.blue, lineWidth: 1, priceLineVisible: false });
				macdHistSeries = macdChart.addHistogramSeries({
					priceLineVisible: false,
					base: 0,
				});
			}

			let rsiChart = null;
			let rsiSeries = null;
			let rsiUpper = null;
			let rsiLower = null;

			if (config.indicators.rsi) {
				rsiChart = LightweightCharts.createChart(rsiContainer, {
					...chartOptions(),
					width: rsiContainer.clientWidth || 400,
					height: rsiContainer.clientHeight || 150,
				});
				rsiSeries = rsiChart.addLineSeries({ color: colors.yellow, lineWidth: 1, priceLineVisible: false });
				rsiUpper = rsiChart.addLineSeries({ color: colors.gray, lineWidth: 1, lineStyle: 2, priceLineVisible: false });
				rsiLower = rsiChart.addLineSeries({ color: colors.gray, lineWidth: 1, lineStyle: 2, priceLineVisible: false });
			}

			const syncTargets = [mainChart];
			if (macdChart) syncTargets.push(macdChart);
			if (rsiChart) syncTargets.push(rsiChart);
			syncTargets.forEach((chart) => syncTimeScale(chart, syncTargets.filter((c) => c !== chart)));

			function applyAllIndicators(candles) {
				const closes = candles.map((x) => x.close);
				const times = candles.map((x) => x.time);

				if (config.indicators.bb && bbUpper && bbMid && bbLower) {
					const bb = calcBollinger(closes, times);
					bbUpper.setData(bb.upper);
					bbMid.setData(bb.mid);
					bbLower.setData(bb.lower);
				}

				if (config.indicators.macd && macdSeries && macdSignalSeries && macdHistSeries) {
					const macd = calcMACD(closes, times);
					macdSeries.setData(macd.macd);
					macdSignalSeries.setData(macd.signal);
					macdHistSeries.setData(
						macd.hist.map((v) => ({
							...v,
							color: v.value >= 0 ? "rgba(14, 203, 129, 0.65)" : "rgba(246, 70, 93, 0.65)",
						})),
					);
				}

				if (config.indicators.rsi && rsiSeries && rsiUpper && rsiLower) {
					const rsi = calcRSI(closes, times);
					rsiSeries.setData(rsi);
					const refs = times.map((t) => ({ time: t, value: 70 }));
					const refs2 = times.map((t) => ({ time: t, value: 30 }));
					rsiUpper.setData(refs);
					rsiLower.setData(refs2);
				}
			}

			function setStatus(msg) {
				statusEl.textContent = msg;
			}

			let candles = [];
			let socket = null;

			function renderCandles(data) {
				candles = data;
				candleSeries.setData(candles);
				volumeSeries.setData(
					candles.map((x) => ({
						time: x.time,
						value: x.volume,
						color: x.close >= x.open ? "rgba(14, 203, 129, 0.5)" : "rgba(246, 70, 93, 0.5)",
					})),
				);
				applyAllIndicators(candles);
				mainChart.timeScale().fitContent();
				
				// Resize charts after data is set
				setTimeout(() => resizeAllCharts(), 100);
			}

			function upsertCandle(c) {
				if (!candles.length) {
					candles = [c];
				} else {
					const last = candles[candles.length - 1];
					if (last.time === c.time) {
						candles[candles.length - 1] = c;
					} else if (c.time > last.time) {
						candles.push(c);
						if (candles.length > 1200) candles.shift();
					}
				}

				candleSeries.update(c);
				volumeSeries.update({
					time: c.time,
					value: c.volume,
					color: c.close >= c.open ? "rgba(14, 203, 129, 0.5)" : "rgba(246, 70, 93, 0.5)",
				});
				applyAllIndicators(candles);
			}

			async function loadInitial() {
				setStatus(config.symbol + " · " + config.interval.toUpperCase());
				try {
					const url =
						"https://fapi.binance.com/fapi/v1/klines?symbol=" +
						config.symbol +
						"&interval=" +
						config.interval +
						"&limit=700";
					const res = await fetch(url);
					if (!res.ok) {
						throw new Error("HTTP " + res.status + ": " + res.statusText);
					}
					const raw = await res.json();
					if (!Array.isArray(raw) || raw.length === 0) {
						throw new Error("No data received");
					}
					renderCandles(raw.map(toCandle));
				} catch (err) {
					setStatus("Error: " + (err.message || "Unknown error"));
					console.error("Chart load error:", err);
				}
			}

			function connectSocket() {
				const stream = config.symbol.toLowerCase() + "@kline_" + config.interval;
				socket = new WebSocket("wss://fstream.binance.com/ws/" + stream);

				socket.onopen = () => setStatus(config.symbol + " · " + config.interval.toUpperCase() + " · LIVE");
				socket.onerror = () => setStatus(config.symbol + " · " + config.interval.toUpperCase() + " · RECONNECT");

				socket.onmessage = (event) => {
					const payload = JSON.parse(event.data);
					const k = payload && payload.k;
					if (!k) return;

					upsertCandle({
						time: Math.floor(k.t / 1000),
						open: Number(k.o),
						high: Number(k.h),
						low: Number(k.l),
						close: Number(k.c),
						volume: Number(k.v),
					});
				};

				socket.onclose = () => {
					setStatus(config.symbol + " · " + config.interval.toUpperCase() + " · RETRY");
					setTimeout(connectSocket, 1500);
				};
			}

			window.addEventListener("resize", () => {
				resizeAllCharts();
			});

			(async () => {
				try {
					await loadInitial();
					connectSocket();
					// Ensure charts are properly sized after initialization
					setTimeout(() => resizeAllCharts(), 300);
				} catch (e) {
					setStatus("Chart load failed: " + (e.message || "Unknown error"));
					console.error("Init error:", e);
				}
			})();

			window.addEventListener("beforeunload", () => {
				if (socket) socket.close();
			});
		</script>
	</body>
</html>
`;
};

export default function ChartScreen() {
	const insets = useSafeAreaInsets();
	const [selectedSymbol, setSelectedSymbol] = useState("BTCUSDT");
	const [selectedInterval, setSelectedInterval] = useState("15m");
	const [indicators, setIndicators] = useState({
		macd: true,
		rsi: true,
		bb: true,
	});

	const html = useMemo(
		() =>
			buildLightweightChartHtml({
				symbol: selectedSymbol,
				interval: selectedInterval,
				indicators,
			}),
		[selectedSymbol, selectedInterval, indicators],
	);

	const webviewKey = `${selectedSymbol}-${selectedInterval}-${Object.values(indicators)
		.map((v) => (v ? 1 : 0))
		.join("")}`;

	const toggleIndicator = (key) => {
		setIndicators((prev) => ({ ...prev, [key]: !prev[key] }));
	};

	return (
		<View style={[styles.container, { paddingTop: insets.top + 8 }]}> 
			<View style={styles.toolbarWrap}>
				<ScrollView
					horizontal
					showsHorizontalScrollIndicator={false}
					contentContainerStyle={styles.rowScrollContent}
				>
					{SYMBOL_OPTIONS.map((item) => {
						const active = selectedSymbol === item.value;
						return (
							<TouchableOpacity
								key={item.value}
								onPress={() => setSelectedSymbol(item.value)}
								style={[styles.chip, active && styles.chipActive]}
							>
								<Text style={[styles.chipText, active && styles.chipTextActive]}>
									{item.label}
								</Text>
							</TouchableOpacity>
						);
					})}
				</ScrollView>

				<ScrollView
					horizontal
					showsHorizontalScrollIndicator={false}
					contentContainerStyle={styles.rowScrollContent}
				>
					{TIMEFRAME_OPTIONS.map((item) => {
						const active = selectedInterval === item.value;
						return (
							<TouchableOpacity
								key={item.value}
								onPress={() => setSelectedInterval(item.value)}
								style={[styles.chip, active && styles.chipActive]}
							>
								<Text style={[styles.chipText, active && styles.chipTextActive]}>
									{item.label}
								</Text>
							</TouchableOpacity>
						);
					})}
				</ScrollView>

				<View style={styles.indicatorRow}>
					{Object.entries(INDICATOR_META).map(([key, meta]) => {
						const active = indicators[key];
						return (
							<TouchableOpacity
								key={key}
								onPress={() => toggleIndicator(key)}
								style={[styles.indicatorBtn, active && styles.indicatorBtnActive]}
							>
								<Text
									style={[
										styles.indicatorText,
										active && styles.indicatorTextActive,
									]}
								>
									{meta.label}
								</Text>
							</TouchableOpacity>
						);
					})}
				</View>
			</View>

			<WebView
				key={webviewKey}
				source={{ html }}
				originWhitelist={["*"]}
				javaScriptEnabled={true}
				domStorageEnabled={true}
				scalesPageToFit={true}
				scrollEnabled={true}
				showsVerticalScrollIndicator={false}
				showsHorizontalScrollIndicator={false}
				style={styles.webview}
				onError={(syntheticEvent) => {
					console.log("WebView error:", syntheticEvent.nativeEvent);
				}}
				onHttpError={(syntheticEvent) => {
					console.log("HTTP error:", syntheticEvent.nativeEvent);
				}}
				onLoadStart={() => {
					console.log("WebView load started");
				}}
				onLoadEnd={() => {
					console.log("WebView load ended");
				}}
			/>
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: "#0b0e11",
	},
	toolbarWrap: {
		paddingHorizontal: 10,
		paddingBottom: 8,
		rowGap: 8,
	},
	rowScrollContent: {
		paddingRight: 6,
		columnGap: 8,
	},
	chip: {
		paddingHorizontal: 10,
		paddingVertical: 7,
		borderRadius: 9,
		backgroundColor: "#131722",
		borderWidth: 1,
		borderColor: "#1e2329",
	},
	chipActive: {
		backgroundColor: "rgba(240, 185, 11, 0.18)",
		borderColor: "#F0B90B",
	},
	chipText: {
		color: "#B7BDC6",
		fontSize: 12,
		fontWeight: "600",
	},
	chipTextActive: {
		color: "#F0B90B",
	},
	indicatorRow: {
		flexDirection: "row",
		columnGap: 8,
	},
	indicatorBtn: {
		flex: 1,
		paddingVertical: 8,
		alignItems: "center",
		borderRadius: 9,
		backgroundColor: "#131722",
		borderWidth: 1,
		borderColor: "#1e2329",
	},
	indicatorBtnActive: {
		backgroundColor: "rgba(14, 203, 129, 0.18)",
		borderColor: "#0ECB81",
	},
	indicatorText: {
		color: "#B7BDC6",
		fontSize: 12,
		fontWeight: "700",
	},
	indicatorTextActive: {
		color: "#0ECB81",
	},
	webview: {
		flex: 1,
		backgroundColor: "#0b0e11",
	},
});
