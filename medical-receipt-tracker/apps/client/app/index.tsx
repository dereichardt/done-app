import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { useMemo, useState } from "react";
import {
  Alert,
  FlatList,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View
} from "react-native";
import type { Expense, ExpenseStatus } from "@/types/expense";
import { appColors } from "@/theme/tokens";

const statuses: ExpenseStatus[] = [
  "new",
  "reviewed",
  "ready_for_submission",
  "submitted",
  "reimbursed"
];

function createEmptyExpense(): Expense {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    vendor: "",
    serviceDate: new Date().toISOString().slice(0, 10),
    amount: 0,
    currency: "USD",
    category: "medical",
    status: "new",
    notes: "",
    isReimbursable: true
  };
}

export default function HomeScreen() {
  const [draft, setDraft] = useState<Expense>(createEmptyExpense());
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ExpenseStatus | "all">("all");

  const filteredExpenses = useMemo(() => {
    return expenses.filter((expense) => {
      const matchesStatus = statusFilter === "all" || expense.status === statusFilter;
      const query = search.trim().toLowerCase();
      const matchesSearch =
        query.length === 0 ||
        expense.vendor.toLowerCase().includes(query) ||
        expense.serviceDate.includes(query) ||
        String(expense.amount).includes(query);
      return matchesStatus && matchesSearch;
    });
  }, [expenses, search, statusFilter]);

  async function pickImageFromCamera() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permission needed", "Enable camera permission to capture receipts.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      quality: 0.8
    });
    if (!result.canceled) {
      mockExtractAndPopulate(result.assets[0].fileName ?? "camera-receipt.jpg");
    }
  }

  async function pickImageOrPdf() {
    const result = await DocumentPicker.getDocumentAsync({
      multiple: false,
      type: ["image/*", "application/pdf"]
    });
    if (!result.canceled) {
      mockExtractAndPopulate(result.assets[0].name);
    }
  }

  function mockExtractAndPopulate(fileName: string) {
    // Placeholder extraction. Wire to Supabase Edge Function `ingest-receipt`.
    const today = new Date().toISOString().slice(0, 10);
    setDraft((current) => ({
      ...current,
      vendor: fileName.replace(/\.[^.]+$/, "") || "Unknown vendor",
      serviceDate: today,
      amount: Number((Math.random() * 180 + 20).toFixed(2)),
      currency: "USD"
    }));
  }

  function saveExpense() {
    if (!draft.vendor || !draft.serviceDate || draft.amount <= 0) {
      Alert.alert("Missing fields", "Vendor, date, and amount are required.");
      return;
    }
    setExpenses((current) => [{ ...draft }, ...current]);
    setDraft(createEmptyExpense());
  }

  function updateExpenseStatus(id: string, status: ExpenseStatus) {
    setExpenses((current) =>
      current.map((item) => (item.id === id ? { ...item, status } : item))
    );
  }

  function exportCsv() {
    const rows = filteredExpenses.map((item) =>
      [
        item.vendor,
        item.serviceDate,
        item.amount.toFixed(2),
        item.currency,
        item.category,
        item.status,
        item.isReimbursable ? "yes" : "no"
      ].join(",")
    );
    const csv = [
      "vendor,serviceDate,amount,currency,category,status,isReimbursable",
      ...rows
    ].join("\n");
    Alert.alert("CSV generated", csv.slice(0, 2500));
  }

  function exportPdfFriendlyView() {
    Alert.alert(
      "PDF export",
      "Use your browser print dialog and Save as PDF from this ledger view for HSA submission."
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <FlatList
        ListHeaderComponent={
          <View style={styles.content}>
            <Text style={styles.sectionTitle}>1) Receipt ingestion</Text>
            <View style={styles.row}>
              <Pressable style={styles.primaryButton} onPress={pickImageFromCamera}>
                <Text style={styles.buttonText}>Take Photo</Text>
              </Pressable>
              <Pressable style={styles.secondaryButton} onPress={pickImageOrPdf}>
                <Text style={styles.secondaryButtonText}>Upload Photo/PDF</Text>
              </Pressable>
            </View>

            <Text style={styles.sectionTitle}>2) Review and edit extracted fields</Text>
            <TextInput
              style={styles.input}
              placeholder="Vendor"
              value={draft.vendor}
              onChangeText={(vendor) => setDraft((current) => ({ ...current, vendor }))}
            />
            <TextInput
              style={styles.input}
              placeholder="Service date (YYYY-MM-DD)"
              value={draft.serviceDate}
              onChangeText={(serviceDate) =>
                setDraft((current) => ({ ...current, serviceDate }))
              }
            />
            <TextInput
              style={styles.input}
              placeholder="Amount"
              keyboardType="decimal-pad"
              value={String(draft.amount)}
              onChangeText={(rawAmount) =>
                setDraft((current) => ({
                  ...current,
                  amount: Number(rawAmount || 0)
                }))
              }
            />
            <TextInput
              style={styles.input}
              placeholder="Category"
              value={draft.category}
              onChangeText={(category) => setDraft((current) => ({ ...current, category }))}
            />
            <TextInput
              style={styles.input}
              placeholder="Notes"
              value={draft.notes}
              onChangeText={(notes) => setDraft((current) => ({ ...current, notes }))}
            />
            <View style={styles.switchRow}>
              <Text>Reimbursable</Text>
              <Switch
                value={draft.isReimbursable}
                onValueChange={(isReimbursable) =>
                  setDraft((current) => ({ ...current, isReimbursable }))
                }
              />
            </View>
            <Pressable style={styles.primaryButton} onPress={saveExpense}>
              <Text style={styles.buttonText}>Save Expense</Text>
            </Pressable>

            <Text style={styles.sectionTitle}>3) Searchable expense ledger</Text>
            <TextInput
              style={styles.input}
              placeholder="Search vendor/date/amount"
              value={search}
              onChangeText={setSearch}
            />
            <View style={styles.statusFilterRow}>
              <Pressable
                style={[
                  styles.statusChip,
                  statusFilter === "all" && styles.statusChipActive
                ]}
                onPress={() => setStatusFilter("all")}
              >
                <Text>all</Text>
              </Pressable>
              {statuses.map((status) => (
                <Pressable
                  key={status}
                  style={[
                    styles.statusChip,
                    statusFilter === status && styles.statusChipActive
                  ]}
                  onPress={() => setStatusFilter(status)}
                >
                  <Text>{status}</Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.row}>
              <Pressable style={styles.secondaryButton} onPress={exportCsv}>
                <Text style={styles.secondaryButtonText}>Export CSV</Text>
              </Pressable>
              <Pressable style={styles.secondaryButton} onPress={exportPdfFriendlyView}>
                <Text style={styles.secondaryButtonText}>Export PDF Guide</Text>
              </Pressable>
            </View>
          </View>
        }
        data={filteredExpenses}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{item.vendor}</Text>
            <Text>
              {item.serviceDate} - {item.currency} {item.amount.toFixed(2)}
            </Text>
            <Text>
              {item.category} - {item.isReimbursable ? "reimbursable" : "not reimbursable"}
            </Text>
            <TextInput
              style={styles.input}
              value={item.status}
              onChangeText={(value) => {
                const next = statuses.find((status) => status === value);
                if (next) {
                  updateExpenseStatus(item.id, next);
                }
              }}
            />
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: appColors.surfaceBase },
  content: { padding: 16, gap: 10 },
  sectionTitle: { fontSize: 18, fontWeight: "600", marginTop: 8 },
  row: { flexDirection: "row", gap: 8 },
  primaryButton: {
    backgroundColor: appColors.action,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10
  },
  secondaryButton: {
    backgroundColor: appColors.surfaceAlt,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10
  },
  buttonText: { color: appColors.actionText, fontWeight: "600" },
  secondaryButtonText: { color: appColors.textBase, fontWeight: "500" },
  input: {
    borderColor: appColors.borderSubtle,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: appColors.surfaceRaised
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginVertical: 4
  },
  statusFilterRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  statusChip: {
    borderWidth: 1,
    borderColor: appColors.borderSubtle,
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: appColors.surfaceRaised
  },
  statusChipActive: {
    borderColor: appColors.action,
    backgroundColor: appColors.actionSoft
  },
  card: {
    marginHorizontal: 16,
    marginVertical: 6,
    padding: 12,
    borderRadius: 10,
    backgroundColor: appColors.surfaceRaised,
    borderWidth: 1,
    borderColor: appColors.borderMuted,
    gap: 6
  },
  cardTitle: { fontSize: 16, fontWeight: "600" }
});
