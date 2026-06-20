import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import React, { useState } from "react";
import {
  Alert,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { Colors } from "./Color";
import { Storage } from "../utils/storage";

export default function AddFundModal({ visible, onClose, onUpdate }) {
  const [amount, setAmount] = useState("");

  const handleAdd = async () => {
    const valueToAdd = parseFloat(amount);
    if (isNaN(valueToAdd) || valueToAdd <= 0) {
      Alert.alert("Error", "올바른 금액을 입력해주세요.");
      return;
    }

    try {
      const success = await Storage.deposit(valueToAdd);

      if (success) {
        if (onUpdate) onUpdate();
        setAmount("");
        onClose();
        Alert.alert("Success", `$${valueToAdd.toLocaleString()} 충전 완료!`);
      } else {
        Alert.alert("Error", "충전에 실패했습니다.");
      }
    } catch (error) {
      Alert.alert("Error", "충전 중 오류가 발생했습니다.");
    }
  };

  return (
    <Modal
      animationType="fade"
      transparent={true}
      visible={visible}
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <BlurView intensity={30} tint="dark" style={styles.modalContainer}>
          <View style={styles.header}>
            <Text style={styles.title}>Add Funds</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color="#fff" />
            </TouchableOpacity>
          </View>

          <View style={styles.content}>
            <Text style={styles.label}>Amount (USD)</Text>
            <View style={styles.inputWrapper}>
              <TextInput
                style={styles.input}
                placeholder="1000"
                placeholderTextColor={Colors.textDim}
                keyboardType="numeric"
                value={amount}
                onChangeText={setAmount}
                autoFocus
              />
            </View>

            <TouchableOpacity style={styles.confirmBtn} onPress={handleAdd}>
              <Text style={styles.confirmText}>Confirm Deposit</Text>
            </TouchableOpacity>
          </View>
        </BlurView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContainer: {
    width: "85%",
    borderRadius: 20,
    backgroundColor: "rgba(30,30,30,0.9)",
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.1)",
  },
  title: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#fff",
  },
  content: {
    padding: 20,
  },
  label: {
    color: Colors.textDim,
    fontSize: 14,
    marginBottom: 10,
  },
  inputWrapper: {
    backgroundColor: "rgba(0,0,0,0.3)",
    borderRadius: 12,
    paddingHorizontal: 15,
    paddingVertical: 12,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  input: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "600",
  },
  confirmBtn: {
    backgroundColor: Colors.up,
    paddingVertical: 15,
    borderRadius: 12,
    alignItems: "center",
  },
  confirmText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 16,
  },
});