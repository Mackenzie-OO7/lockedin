import { useState, useEffect } from "react";
import { Card, Button, Input, Layout, Icon } from "@stellar/design-system";
import { useWallet } from "../hooks/useWallet";
import * as LockedInContract from "lockedin";
import { rpcUrl } from "../contracts/util";

export default function Dashboard() {
  const { address, signTransaction } = useWallet();
  const [cycles, setCycles] = useState<bigint[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeSection, setActiveSection] = useState<"cycles" | "create">("cycles");
  const [billsDueSoon, setBillsDueSoon] = useState<any[]>([]);

  const [durationMonths, setDurationMonths] = useState("3");
  const [depositAmount, setDepositAmount] = useState("");

  useEffect(() => {
    if (address) {
      loadCycles();
      checkBillsDueSoon();
    }
  }, [address]);

  // Check for bills due within 24 hours
  const checkBillsDueSoon = async () => {
    if (!address) return;

    try {
      const contract = new LockedInContract.Client({
        ...LockedInContract.networks.testnet,
        rpcUrl,
        publicKey: address,
      });

      // Get user's cycles
      const { result: userCycles } = await contract.get_user_cycles({ user: address });

      const dueSoon: any[] = [];
      const now = Date.now() / 1000;
      const hoursAhead = 24;
      const secondsAhead = hoursAhead * 3600;

      for (const cycleId of userCycles) {
        const billsTx = await contract.get_cycle_bills({ cycle_id: cycleId });
        const billsSim = await billsTx.simulate();
        const billIds = (billsSim.result as any)?.value || billsSim.result;

        if (!billIds || billIds.length === 0) continue;

        for (const billId of billIds) {
          const billTx = await contract.get_bill({ bill_id: billId });
          const billSim = await billTx.simulate();
          const billData = (billSim.result as any)?.value || billSim.result;

          const dueDate = Number(billData.due_date);
          const timeUntilDue = dueDate - now;

          if (timeUntilDue > 0 && timeUntilDue <= secondsAhead && !billData.is_paid) {
            dueSoon.push({
              ...billData,
              hoursUntilDue: Math.floor(timeUntilDue / 3600)
            });
          }
        }
      }

      setBillsDueSoon(dueSoon);
    } catch (error) {
      console.error("Error checking bills due soon:", error);
    }
  };

  const loadCycles = async () => {
    if (!address) return;

    setLoading(true);
    try {
      const contract = new LockedInContract.Client({
        ...LockedInContract.networks.testnet,
        rpcUrl,
        publicKey: address,
      });

      const { result } = await contract.get_user_cycles({
        user: address,
      });
      setCycles(result);
    } catch (error) {
      console.error("Error loading cycles:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateCycle = async () => {
    if (!address || !depositAmount || !signTransaction) return;

    setLoading(true);
    try {
      const amountInStroops = BigInt(parseFloat(depositAmount) * 10_000_000);

      const contract = new LockedInContract.Client({
        ...LockedInContract.networks.testnet,
        rpcUrl,
        publicKey: address,
      });

      const tx = await contract.create_cycle({
        user: address,
        duration_months: parseInt(durationMonths),
        amount: amountInStroops,
      });

      const { result } = await tx.signAndSend({
        signTransaction: async (xdr: string) => {
          return await signTransaction(xdr, {
            networkPassphrase: "Test SDF Network ; September 2015",
          });
        },
      });

      console.log("Cycle created:", result);
      const cycleId = typeof result === 'bigint' ? result : (result as any)?.unwrap?.() ?? result;
      console.log("Cycle ID:", cycleId);

      await loadCycles();
      setActiveSection("cycles");
      setDepositAmount("");
      alert(`Successfully created cycle #${cycleId}!`);
    } catch (error) {
      console.error("Error creating cycle:", error);
      alert(`Failed to create cycle: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setLoading(false);
    }
  };

  if (!address) {
    return (
      <Layout.Content>
        <div style={{
          textAlign: "center",
          padding: "4rem 2rem",
          maxWidth: "600px",
          margin: "0 auto"
        }}>
          <Icon.Lock01 size="xl" />
          <h1 style={{ marginTop: "1rem" }}>Welcome to LockedIn</h1>
          <p style={{ color: "#666", marginTop: "0.5rem" }}>
            Get LockedIn to financial discipline. Connect your wallet to get started.
          </p>
        </div>
      </Layout.Content>
    );
  }

  return (
    <Layout.Content>
      <div style={{ padding: "2rem", maxWidth: "1200px", margin: "0 auto" }}>
        {/* Header */}
        <div style={{ marginBottom: "2rem" }}>
          <h1>Dashboard</h1>
          <p style={{ color: "#666" }}>
            Manage your bill payment cycles and never miss a payment.
          </p>
        </div>

        {/* Bills Due Soon Notification */}
        {billsDueSoon.length > 0 && (
          <div style={{
            background: "linear-gradient(135deg, #ff6b6b 0%, #ee5a6f 100%)",
            color: "white",
            padding: "1rem 1.5rem",
            borderRadius: "8px",
            marginBottom: "2rem",
            boxShadow: "0 4px 12px rgba(255, 107, 107, 0.2)"
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.5rem" }}>
              <Icon.AlertCircle size="md" />
              <h3 style={{ margin: 0, fontSize: "1.1rem" }}>
                {billsDueSoon.length} Bill{billsDueSoon.length > 1 ? 's' : ''} Due Soon!
              </h3>
            </div>
            <div style={{ paddingLeft: "2rem" }}>
              {billsDueSoon.map((bill, idx) => (
                <div key={idx} style={{
                  marginBottom: idx < billsDueSoon.length - 1 ? "0.5rem" : 0,
                  fontSize: "0.95rem"
                }}>
                  <strong>{bill.name}</strong> - {(Number(bill.amount) / 10_000_000).toFixed(2)} USDC
                  {" "}({bill.hoursUntilDue}h remaining)
                </div>
              ))}
            </div>
            <div style={{
              marginTop: "0.75rem",
              paddingLeft: "2rem",
              fontSize: "0.85rem",
              opacity: 0.9
            }}>
              💡 These bills will be automatically paid on their due date by the keeper service.
            </div>
          </div>
        )}

        {/* Section Tabs */}
        <div style={{
          display: "flex",
          gap: "1rem",
          marginBottom: "2rem",
          borderBottom: "1px solid #e0e0e0",
          paddingBottom: "0.5rem"
        }}>
          <Button
            variant={activeSection === "cycles" ? "primary" : "tertiary"}
            size="md"
            onClick={() => setActiveSection("cycles")}
          >
            <Icon.FileCheck02 size="md" />
            My Cycles ({cycles.length})
          </Button>
          <Button
            variant={activeSection === "create" ? "primary" : "tertiary"}
            size="md"
            onClick={() => setActiveSection("create")}
          >
            <Icon.PlusCircle size="md" />
            Create New Cycle
          </Button>
        </div>

        {/* Cycles Section */}
        {activeSection === "cycles" && (
          <div>
            {loading ? (
              <Card>
                <p style={{ textAlign: "center", padding: "2rem" }}>Loading cycles...</p>
              </Card>
            ) : cycles.length === 0 ? (
              <Card>
                <div style={{ textAlign: "center", padding: "3rem" }}>
                  <Icon.FileX02 size="xl" />
                  <h3 style={{ marginTop: "1rem" }}>No Cycles Yet</h3>
                  <p style={{ color: "#666", marginTop: "0.5rem" }}>
                    Create your first bill payment cycle to get started.
                  </p>
                  <Button
                    variant="primary"
                    size="md"
                    style={{ marginTop: "1.5rem" }}
                    onClick={() => setActiveSection("create")}
                  >
                    <Icon.PlusCircle size="md" />
                    Create First Cycle
                  </Button>
                </div>
              </Card>
            ) : (
              <div style={{ display: "grid", gap: "1rem" }}>
                {cycles.map((cycleId) => (
                  <CycleCard key={cycleId.toString()} cycleId={cycleId} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Create Cycle Section */}
        {activeSection === "create" && (
          <Card>
            <div style={{ padding: "2rem" }}>
              <h2 style={{ marginBottom: "1.5rem" }}>Create New Cycle</h2>

              <div style={{ marginBottom: "1.5rem" }}>
                <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: 500 }}>
                  Duration (months)
                </label>
                <Input
                  id="duration"
                  fieldSize="md"
                  type="number"
                  min="1"
                  max="12"
                  value={durationMonths}
                  onChange={(e) => setDurationMonths(e.target.value)}
                  placeholder="3"
                />
                <small style={{ color: "#666", marginTop: "0.25rem", display: "block" }}>
                  Choose between 1-12 months
                </small>
              </div>

              <div style={{ marginBottom: "1.5rem" }}>
                <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: 500 }}>
                  Deposit Amount (USDC)
                </label>
                <Input
                  id="amount"
                  fieldSize="md"
                  type="number"
                  step="0.01"
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                  placeholder="100.00"
                />
                <small style={{ color: "#666", marginTop: "0.25rem", display: "block" }}>
                  Amount to lock for bill payments (2% fee will be deducted)
                </small>
              </div>

              {depositAmount && (
                <div style={{
                  background: "#f5f5f5",
                  padding: "1rem",
                  borderRadius: "8px",
                  marginBottom: "1.5rem"
                }}>
                  <h4 style={{ marginBottom: "0.5rem" }}>Summary</h4>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.25rem" }}>
                    <span>Deposit:</span>
                    <span>{parseFloat(depositAmount).toFixed(2)} USDC</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.25rem" }}>
                    <span>Fee (2%):</span>
                    <span>{(parseFloat(depositAmount) * 0.02).toFixed(2)} USDC</span>
                  </div>
                  <div style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontWeight: 600,
                    paddingTop: "0.5rem",
                    borderTop: "1px solid #ddd",
                    marginTop: "0.5rem"
                  }}>
                    <span>Available for bills:</span>
                    <span>{(parseFloat(depositAmount) * 0.98).toFixed(2)} USDC</span>
                  </div>
                </div>
              )}

              <div style={{ display: "flex", gap: "1rem" }}>
                <Button
                  variant="primary"
                  size="md"
                  onClick={handleCreateCycle}
                  disabled={loading || !depositAmount || parseFloat(depositAmount) <= 0}
                  isLoading={loading}
                >
                  <Icon.Lock01 size="md" />
                  Lock Funds & Create Cycle
                </Button>
                <Button
                  variant="secondary"
                  size="md"
                  onClick={() => setActiveSection("cycles")}
                  disabled={loading}
                >
                  Cancel
                </Button>
              </div>
            </div>
          </Card>
        )}
      </div>
    </Layout.Content>
  );
}

interface BillForm {
  name: string;
  amount: string;
  dueDate: string;
  isRecurring: boolean;
  recurrenceDays: number[];
  isEmergency: boolean;
}

function getDaySuffix(day: number): string {
  if (day >= 11 && day <= 13) return 'th';
  switch (day % 10) {
    case 1: return 'st';
    case 2: return 'nd';
    case 3: return 'rd';
    default: return 'th';
  }
}

function CycleCard({ cycleId }: { cycleId: bigint }) {
  const { address, signTransaction } = useWallet();
  const [cycleData, setCycleData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showAddBills, setShowAddBills] = useState(false);
  const [showBillsList, setShowBillsList] = useState(false);
  const [bills, setBills] = useState<BillForm[]>([]);
  const [cycleBills, setCycleBills] = useState<any[]>([]);
  const [selectedBill, setSelectedBill] = useState<any>(null);
  const [showBillDetails, setShowBillDetails] = useState(false);

  useEffect(() => {
    loadCycleData();
  }, [cycleId]);

  const loadCycleData = async () => {
    if (!address) return;

    try {
      const contract = new LockedInContract.Client({
        ...LockedInContract.networks.testnet,
        rpcUrl,
        publicKey: address,
      });

      const tx = await contract.get_cycle({ cycle_id: cycleId });
      const simulated = await tx.simulate();

      const data = (simulated.result as any)?.value || simulated.result;

      console.log("Cycle data for ID", cycleId, ":", data);
      setCycleData(data);
    } catch (error) {
      console.error("Error loading cycle for ID", cycleId, ":", error);
    } finally {
      setLoading(false);
    }
  };

  const addNewBillForm = () => {
    setBills([...bills, {
      name: "",
      amount: "",
      dueDate: "",
      isRecurring: false,
      recurrenceDays: [],
      isEmergency: false
    }]);
  };

  const removeBillForm = (index: number) => {
    setBills(bills.filter((_, i) => i !== index));
  };

  const updateBillForm = (index: number, field: keyof BillForm, value: any) => {
    const updated = [...bills];
    updated[index] = { ...updated[index], [field]: value };
    setBills(updated);
  };

  const loadCycleBills = async () => {
    if (!address) return;

    try {
      const contract = new LockedInContract.Client({
        ...LockedInContract.networks.testnet,
        rpcUrl,
        publicKey: address,
      });

      const tx = await contract.get_cycle_bills({ cycle_id: cycleId });
      const simulated = await tx.simulate();
      const billIds = (simulated.result as any)?.value || simulated.result;

      if (!billIds || billIds.length === 0) {
        setCycleBills([]);
        return;
      }

      const billDetails = [];
      for (const billId of billIds) {
        const billTx = await contract.get_bill({ bill_id: billId });
        const billSim = await billTx.simulate();
        const billData = (billSim.result as any)?.value || billSim.result;
        billDetails.push(billData);
      }

      setCycleBills(billDetails);
    } catch (error) {
      console.error("Failed to load bills:", error);
    }
  };

  const handleCancelBillOccurrence = async (billId: bigint, isRecurring: boolean) => {
    if (!address || !signTransaction) return;

    const confirmMessage = isRecurring
      ? `Skip the next occurrence of this recurring bill?\n\n` +
      `The bill will remain in your cycle but the next payment will be skipped.\n` +
      `Note: You can only make one adjustment per month.`
      : `Delete this one-time bill?\n\n` +
      `This bill will be permanently removed from your cycle.\n` +
      `Note: You can only make one adjustment per month.`;

    const confirmCancel = window.confirm(confirmMessage);
    if (!confirmCancel) return;

    try {
      const contract = new LockedInContract.Client({
        ...LockedInContract.networks.testnet,
        rpcUrl,
        publicKey: address,
      });

      const tx = await contract.cancel_bill_occurrence({ bill_id: billId });

      await tx.signAndSend({
        signTransaction: async (xdr: string) => {
          return await signTransaction(xdr, {
            networkPassphrase: "Test SDF Network ; September 2015",
          });
        },
      });

      const successMsg = isRecurring
        ? "Successfully skipped next occurrence! The bill will still recur in future months."
        : "Bill deleted successfully!";

      alert(successMsg);
      setShowBillDetails(false);
      setSelectedBill(null);
      await loadCycleBills();
      await loadCycleData();
    } catch (error: any) {
      console.error("Error cancelling bill occurrence:", error);

      let errorMsg = "Failed to process bill cancellation";
      if (error.message?.includes("MonthlyAdjustmentLimitReached")) {
        errorMsg = "You have already made a bill adjustment this month. You can only add/cancel one bill per month.";
      } else if (error.message) {
        errorMsg = error.message;
      }

      alert(errorMsg);
    }
  };

  const handleCancelBillPermanently = async (billId: bigint) => {
    if (!address || !signTransaction) return;

    const confirmCancel = window.confirm(
      `⚠️ DELETE BILL PERMANENTLY?\n\n` +
      `This will completely remove this bill from your cycle.\n` +
      `All future occurrences will be cancelled.\n\n` +
      `This action cannot be undone!\n` +
      `Note: You can only make one adjustment per month.`
    );

    if (!confirmCancel) return;

    try {
      const contract = new LockedInContract.Client({
        ...LockedInContract.networks.testnet,
        rpcUrl,
        publicKey: address,
      });

      const tx = await contract.cancel_bill_all_occurrences({ bill_id: billId });

      await tx.signAndSend({
        signTransaction: async (xdr: string) => {
          return await signTransaction(xdr, {
            networkPassphrase: "Test SDF Network ; September 2015",
          });
        },
      });

      alert("Bill permanently deleted!");
      setShowBillDetails(false);
      setSelectedBill(null);
      await loadCycleBills();
      await loadCycleData();
    } catch (error: any) {
      console.error("Error deleting bill:", error);

      let errorMsg = "Failed to delete bill";
      if (error.message?.includes("MonthlyAdjustmentLimitReached")) {
        errorMsg = "You have already made a bill adjustment this month. You can only add/cancel one bill per month.";
      } else if (error.message) {
        errorMsg = error.message;
      }

      alert(errorMsg);
    }
  };

  const handleSubmitBills = async () => {
    if (bills.length === 0) {
      alert("Please add at least one bill");
      return;
    }

    for (const bill of bills) {
      if (!bill.name || !bill.amount || !bill.dueDate) {
        alert("Please fill in all fields for each bill");
        return;
      }
    }

    const cycleStartDate = new Date(Number(startDateTimestamp) * 1000);
    const cycleEndDate = new Date(Number(endDateTimestamp) * 1000);
    let newBillsAllocation = 0;

    for (const bill of bills) {
      const billAmount = parseFloat(bill.amount) * 10_000_000;

      if (bill.isRecurring) {
        const billDueDate = new Date(bill.dueDate);
        const dayOfMonth = billDueDate.getDate();

        let occurrences = 0;
        let currentDate = new Date(cycleStartDate);

        while (currentDate <= cycleEndDate) {
          const currentMonth = currentDate.getMonth() + 1;
          const currentYear = currentDate.getFullYear();

          const potentialDueDate = new Date(currentYear, currentMonth - 1, dayOfMonth);
          if (potentialDueDate >= cycleStartDate && potentialDueDate <= cycleEndDate) {
            occurrences++;
          }

          currentDate.setMonth(currentDate.getMonth() + 1);
        }

        newBillsAllocation += billAmount * occurrences;
      } else {
        newBillsAllocation += billAmount;
      }
    }

    const currentAllocated = calculateAllocated();
    const totalAllocated = currentAllocated + newBillsAllocation;
    const availableBalance = Number(totalDeposited) - Number(operatingFee);

    if (totalAllocated > availableBalance) {
      const excess = ((totalAllocated - availableBalance) / 10_000_000).toFixed(2);
      const available = ((availableBalance - currentAllocated) / 10_000_000).toFixed(2);
      alert(
        `Cannot add bills: Total allocation exceeds deposit!\n\n` +
        `Available balance: ${available} USDC\n` +
        `New bills would allocate: ${(newBillsAllocation / 10_000_000).toFixed(2)} USDC\n` +
        `Excess amount: ${excess} USDC\n\n` +
        `Please reduce bill amounts or remove some bills.`
      );
      return;
    }

    try {
      const contract = new LockedInContract.Client({
        ...LockedInContract.networks.testnet,
        rpcUrl,
        publicKey: address,
      });

      const billsToAdd = bills.map(bill => {
        const amountInStroops = BigInt(Math.floor(parseFloat(bill.amount) * 10_000_000));
        const dueDateTimestamp = BigInt(Math.floor(new Date(bill.dueDate).getTime() / 1000));

        let recurrenceCalendar: number[] = [];
        if (bill.isRecurring) {
          const cycleStartDate = new Date(Number(startDateTimestamp) * 1000);
          const cycleEndDate = new Date(Number(endDateTimestamp) * 1000);
          const billDueDate = new Date(bill.dueDate);
          const dayOfMonth = billDueDate.getDate();

          const monthsSet = new Set<number>();
          let currentDate = new Date(cycleStartDate);

          while (currentDate <= cycleEndDate) {
            const currentMonth = currentDate.getMonth() + 1;

            const potentialDueDate = new Date(currentYear, currentMonth - 1, dayOfMonth);

            if (potentialDueDate >= cycleStartDate && potentialDueDate <= cycleEndDate) {
              monthsSet.add(currentMonth);
            }

            currentDate.setMonth(currentDate.getMonth() + 1);
          }

          recurrenceCalendar = Array.from(monthsSet).sort((a, b) => a - b);
        }

        return [bill.name, amountInStroops, dueDateTimestamp, bill.isRecurring, recurrenceCalendar] as [string, bigint, bigint, boolean, number[]];

      });

      const tx = await contract.add_bills({
        cycle_id: cycleId,
        bills: billsToAdd,
      });

      await tx.signAndSend({
        signTransaction: async (xdr: string) => {
          return await signTransaction!(xdr, {
            networkPassphrase: "Test SDF Network ; September 2015",
          });
        },
      });

      alert(`Successfully added ${bills.length} bill(s)!`);
      setBills([]);
      setShowAddBills(false);
      loadCycleData();
      loadCycleBills();
    } catch (error) {
      console.error("Failed to add bills:", error);
      alert(`Failed to add bills: ${error}`);
    }
  };

  if (loading) {
    return (
      <Card>
        <p style={{ padding: "1rem" }}>Loading...</p>
      </Card>
    );
  }

  if (!cycleData) {
    return null;
  }

  console.log("=== CYCLE DATA DEBUG ===");
  console.log("Full cycleData:", cycleData);
  console.log("total_deposited:", cycleData.total_deposited);
  console.log("total_deposited type:", typeof cycleData.total_deposited);
  console.log("is_active:", cycleData.is_active);
  console.log("is_active type:", typeof cycleData.is_active);

  const extractValue = (val: any): bigint => {
    if (typeof val === 'bigint') return val;
    if (typeof val === 'number') return BigInt(val);
    if (typeof val === 'string') return BigInt(val);
    if (val && typeof val === 'object') {
      return BigInt(val.i128 || val.u64 || val.u32 || 0);
    }
    return BigInt(0);
  };

  const totalDeposited = extractValue(cycleData.total_deposited);
  const operatingFee = extractValue(cycleData.operating_fee);
  const startDateTimestamp = extractValue(cycleData.start_date);
  const endDateTimestamp = extractValue(cycleData.end_date);
  const feePercentage = extractValue(cycleData.fee_percentage);

  const depositedUSDC = (Number(totalDeposited) / 10_000_000).toFixed(2);
  const feeUSDC = (Number(operatingFee) / 10_000_000).toFixed(2);
  const startDate = new Date(Number(startDateTimestamp) * 1000);
  const endDate = new Date(Number(endDateTimestamp) * 1000);
  const feeRate = (Number(feePercentage) / 100).toFixed(1);

  const calculateAllocated = () => {
    if (!cycleBills || cycleBills.length === 0) return 0;

    const cycleStartDate = new Date(Number(startDateTimestamp) * 1000);
    const cycleEndDate = new Date(Number(endDateTimestamp) * 1000);

    let total = 0;

    for (const bill of cycleBills) {
      const billAmount = Number(bill.amount || 0);

      if (bill.is_recurring && bill.recurrence_calendar && bill.recurrence_calendar.length > 0) {
        const billDueDate = new Date(Number(bill.due_date) * 1000);
        const dayOfMonth = billDueDate.getDate();

        let occurrences = 0;
        let currentDate = new Date(cycleStartDate);

        while (currentDate <= cycleEndDate) {
          const currentMonth = currentDate.getMonth() + 1;
          const currentYear = currentDate.getFullYear();

          if (bill.recurrence_calendar.includes(currentMonth)) {
            const potentialDueDate = new Date(currentYear, currentMonth - 1, dayOfMonth);

            if (potentialDueDate >= cycleStartDate && potentialDueDate <= cycleEndDate) {
              occurrences++;
            }
          }

          currentDate.setMonth(currentDate.getMonth() + 1);
        }

        total += billAmount * occurrences;
      } else {
        if (!bill.is_paid) {
          total += billAmount;
        }
      }
    }

    return total;
  };

  const allocatedStroops = calculateAllocated();
  const allocatedUSDC = (allocatedStroops / 10_000_000).toFixed(2);
  const remainingStroops = Number(totalDeposited) - Number(operatingFee) - allocatedStroops;
  const remainingUSDC = (remainingStroops / 10_000_000).toFixed(2);

  return (
    <Card>
      <div style={{ padding: "1.5rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: "1rem" }}>
          <div>
            <h3 style={{ marginBottom: "0.5rem" }}>Cycle #{cycleId.toString()}</h3>
            <div style={{ display: "flex", gap: "1rem", fontSize: "0.9rem", color: "#666" }}>
              <span>📅 {startDate.toLocaleDateString()} - {endDate.toLocaleDateString()}</span>
            </div>
          </div>
          <div style={{
            background: cycleData.is_active ? "#e8f5e9" : "#f5f5f5",
            color: cycleData.is_active ? "#2e7d32" : "#666",
            padding: "0.25rem 0.75rem",
            borderRadius: "12px",
            fontSize: "0.85rem",
            fontWeight: 600
          }}>
            {cycleData.is_active ? "Active" : "Ended"}
          </div>
        </div>

        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
          gap: "1rem",
          marginTop: "1rem"
        }}>
          <div>
            <div style={{ fontSize: "0.85rem", color: "#666", marginBottom: "0.25rem" }}>Deposited</div>
            <div style={{ fontSize: "1.25rem", fontWeight: 600 }}>{depositedUSDC} USDC</div>
          </div>
          <div>
            <div style={{ fontSize: "0.85rem", color: "#666", marginBottom: "0.25rem" }}>Allocated</div>
            <div style={{ fontSize: "1.25rem", fontWeight: 600 }}>{allocatedUSDC} USDC</div>
          </div>
          <div>
            <div style={{ fontSize: "0.85rem", color: "#666", marginBottom: "0.25rem" }}>Remaining</div>
            <div style={{
              fontSize: "1.25rem",
              fontWeight: 600,
              color: remainingStroops < 0 ? "#d32f2f" : "#2e7d32"
            }}>
              {remainingUSDC} USDC
            </div>
          </div>
          <div>
            <div style={{ fontSize: "0.85rem", color: "#666", marginBottom: "0.25rem" }}>Fee ({feeRate}%)</div>
            <div style={{ fontSize: "1.25rem", fontWeight: 600 }}>{feeUSDC} USDC</div>
          </div>
        </div>

        <div style={{ marginTop: "1.5rem", display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
          <Button
            variant="secondary"
            size="md"
            onClick={() => {
              setShowBillsList(!showBillsList);
              if (!showBillsList) loadCycleBills();
            }}
          >
            <Icon.List size="md" />
            {showBillsList ? "Hide Bills" : "Manage Bills"}
          </Button>
          {cycleData.is_active && (
            <Button
              variant="primary"
              size="md"
              onClick={() => {
                setShowAddBills(true);
                if (bills.length === 0) addNewBillForm();
              }}
            >
              <Icon.Plus size="md" />
              Add Bills
            </Button>
          )}
        </div>

        {/* Add Bills Section */}
        {showAddBills && (
          <div style={{
            marginTop: "1.5rem",
            padding: "1.5rem",
            background: "#f8f9fa",
            borderRadius: "8px",
            border: "1px solid #dee2e6"
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
              <h4 style={{ margin: 0 }}>Add Bills to Cycle</h4>
              <Button
                variant="tertiary"
                size="sm"
                onClick={addNewBillForm}
              >
                <Icon.Plus size="sm" />
                Add Bill
              </Button>
            </div>

            {bills.map((bill, index) => (
              <div key={index} style={{
                marginBottom: "1.5rem",
                padding: "1rem",
                background: "white",
                borderRadius: "6px",
                border: "1px solid #dee2e6"
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                  <h5 style={{ margin: 0 }}>Bill #{index + 1}</h5>
                  <Button
                    variant="error"
                    size="sm"
                    onClick={() => removeBillForm(index)}
                  >
                    <Icon.Trash01 size="sm" />
                    Remove
                  </Button>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                  <div>
                    <label style={{ display: "block", marginBottom: "0.5rem", fontSize: "0.9rem", fontWeight: 500 }}>
                      Bill Name *
                    </label>
                    <Input
                      id={`bill-name-${index}`}
                      placeholder="e.g., Netflix, Rent, Electricity"
                      value={bill.name}
                      onChange={(e) => updateBillForm(index, "name", e.target.value)}
                      fieldSize="md"
                    />
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                    <div>
                      <label style={{ display: "block", marginBottom: "0.5rem", fontSize: "0.9rem", fontWeight: 500 }}>
                        Amount (USDC) *
                      </label>
                      <Input
                        id={`bill-amount-${index}`}
                        type="number"
                        placeholder="0.00"
                        value={bill.amount}
                        onChange={(e) => updateBillForm(index, "amount", e.target.value)}
                        fieldSize="md"
                      />
                    </div>

                    <div>
                      <label style={{ display: "block", marginBottom: "0.5rem", fontSize: "0.9rem", fontWeight: 500 }}>
                        Due Date * (day 1-28 only)
                      </label>
                      <Input
                        id={`bill-due-date-${index}`}
                        type="date"
                        value={bill.dueDate}
                        onChange={(e) => {
                          const selectedDate = new Date(e.target.value);
                          const dayOfMonth = selectedDate.getDate();

                          // Validate day is between 1-28
                          if (dayOfMonth < 1 || dayOfMonth > 28) {
                            alert("Due date must be between day 1-28 of the month.\n\nThis ensures recurring bills work in all months including February (which has only 28 days).");
                            return;
                          }

                          updateBillForm(index, "dueDate", e.target.value);
                        }}
                        fieldSize="md"
                      />
                      <small style={{ color: "#666", fontSize: "0.8rem", marginTop: "0.25rem", display: "block" }}>
                        Must be day 1-28 (ensures recurring bills work in all months)
                      </small>
                    </div>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        checked={bill.isRecurring}
                        onChange={(e) => updateBillForm(index, "isRecurring", e.target.checked)}
                      />
                      <span style={{ fontSize: "0.9rem" }}>Recurring monthly bill</span>
                    </label>
                    {bill.isRecurring && bill.dueDate && (
                      <small style={{ color: "#666", fontSize: "0.85rem", marginLeft: "1.5rem" }}>
                        Will repeat on the {new Date(bill.dueDate).getDate()}{getDaySuffix(new Date(bill.dueDate).getDate())} of every month
                      </small>
                    )}

                    <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        checked={bill.isEmergency}
                        onChange={(e) => updateBillForm(index, "isEmergency", e.target.checked)}
                      />
                      <span style={{ fontSize: "0.9rem" }}>Emergency bill</span>
                    </label>
                    {bill.isEmergency && (
                      <small style={{ color: "#666", fontSize: "0.85rem", marginLeft: "1.5rem" }}>
                        No waiting period, can only add 1 per month
                      </small>
                    )}
                  </div>
                </div>
              </div>
            ))}

            <div style={{ display: "flex", gap: "0.75rem", marginTop: "1rem" }}>
              <Button
                variant="primary"
                size="md"
                onClick={handleSubmitBills}
              >
                Submit All Bills
              </Button>
              <Button
                variant="tertiary"
                size="md"
                onClick={() => {
                  setShowAddBills(false);
                  setBills([]);
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        {/* Bills List */}
        {showBillsList && (
          <div style={{
            marginTop: "1.5rem",
            padding: "1.5rem",
            background: "#f8f9fa",
            borderRadius: "8px",
            border: "1px solid #dee2e6"
          }}>
            <h4 style={{ marginBottom: "1rem" }}>Bills in this Cycle</h4>

            {cycleBills.length === 0 ? (
              <p style={{ color: "#666", fontSize: "0.9rem" }}>No bills added yet</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                {cycleBills.map((bill, index) => {
                  const amount = (Number(bill.amount) / 10_000_000).toFixed(2);
                  const dueDate = new Date(Number(bill.due_date) * 1000);
                  const isPaid = bill.is_paid;
                  const isRecurring = bill.is_recurring;
                  const isEmergency = bill.is_emergency;

                  return (
                    <div
                      key={index}
                      onClick={() => {
                        setSelectedBill(bill);
                        setShowBillDetails(true);
                      }}
                      style={{
                        padding: "1rem",
                        background: "white",
                        borderRadius: "6px",
                        border: "1px solid #dee2e6",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        cursor: "pointer",
                        transition: "all 0.2s",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = "#f8f9fa";
                        e.currentTarget.style.borderColor = "#adb5bd";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "white";
                        e.currentTarget.style.borderColor = "#dee2e6";
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.5rem" }}>
                          <h5 style={{ margin: 0 }}>{bill.name}</h5>
                          {isRecurring && (
                            <span style={{
                              background: "#e3f2fd",
                              color: "#1976d2",
                              padding: "0.15rem 0.5rem",
                              borderRadius: "4px",
                              fontSize: "0.75rem",
                              fontWeight: 600
                            }}>
                              RECURRING
                            </span>
                          )}
                          {isEmergency && (
                            <span style={{
                              background: "#fff3e0",
                              color: "#f57c00",
                              padding: "0.15rem 0.5rem",
                              borderRadius: "4px",
                              fontSize: "0.75rem",
                              fontWeight: 600
                            }}>
                              EMERGENCY
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: "0.9rem", color: "#666" }}>
                          <span style={{ fontWeight: 600 }}>{amount} USDC</span>
                          {" • "}
                          Due: {dueDate.toLocaleDateString()}
                        </div>
                      </div>

                      <div>
                        {isPaid ? (
                          <span style={{
                            background: "#e8f5e9",
                            color: "#2e7d32",
                            padding: "0.5rem 1rem",
                            borderRadius: "6px",
                            fontSize: "0.85rem",
                            fontWeight: 600
                          }}>
                            ✓ PAID
                          </span>
                        ) : (
                          <span style={{
                            background: "#fff3e0",
                            color: "#f57c00",
                            padding: "0.5rem 1rem",
                            borderRadius: "6px",
                            fontSize: "0.85rem",
                            fontWeight: 600
                          }}>
                            ⏳ PENDING
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {showBillDetails && selectedBill && (
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: "rgba(0, 0, 0, 0.5)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 1000,
            }}
            onClick={() => {
              setShowBillDetails(false);
              setSelectedBill(null);
            }}
          >
            <div
              style={{
                background: "white",
                borderRadius: "12px",
                padding: "2rem",
                maxWidth: "500px",
                width: "90%",
                maxHeight: "80vh",
                overflow: "auto",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3 style={{ marginTop: 0, marginBottom: "1.5rem" }}>Bill Details</h3>

              <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                <div>
                  <label style={{ fontSize: "0.85rem", color: "#666", display: "block", marginBottom: "0.25rem" }}>
                    Bill ID
                  </label>
                  <div style={{ fontWeight: 600 }}>{selectedBill.id.toString()}</div>
                </div>

                <div>
                  <label style={{ fontSize: "0.85rem", color: "#666", display: "block", marginBottom: "0.25rem" }}>
                    Name
                  </label>
                  <div style={{ fontWeight: 600 }}>{selectedBill.name}</div>
                </div>

                <div>
                  <label style={{ fontSize: "0.85rem", color: "#666", display: "block", marginBottom: "0.25rem" }}>
                    Amount per Payment
                  </label>
                  <div style={{ fontWeight: 600, fontSize: "1.2rem" }}>
                    {(Number(selectedBill.amount) / 10_000_000).toFixed(2)} USDC
                  </div>
                </div>

                {selectedBill.is_recurring && selectedBill.recurrence_calendar && selectedBill.recurrence_calendar.length > 0 && (
                  <div>
                    <label style={{ fontSize: "0.85rem", color: "#666", display: "block", marginBottom: "0.25rem" }}>
                      Total Allocated (All Payments)
                    </label>
                    <div style={{ fontWeight: 600, fontSize: "1.1rem", color: "#1976d2" }}>
                      {((Number(selectedBill.amount) * selectedBill.recurrence_calendar.length) / 10_000_000).toFixed(2)} USDC
                      <span style={{ fontSize: "0.85rem", fontWeight: "normal", color: "#666" }}>
                        {" "}({selectedBill.recurrence_calendar.length} payment{selectedBill.recurrence_calendar.length > 1 ? "s" : ""})
                      </span>
                    </div>
                  </div>
                )}

                <div>
                  <label style={{ fontSize: "0.85rem", color: "#666", display: "block", marginBottom: "0.25rem" }}>
                    Due Date
                  </label>
                  <div style={{ fontWeight: 600 }}>
                    {new Date(Number(selectedBill.due_date) * 1000).toLocaleDateString()} at{" "}
                    {new Date(Number(selectedBill.due_date) * 1000).toLocaleTimeString()}
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: "0.85rem", color: "#666", display: "block", marginBottom: "0.25rem" }}>
                    Type
                  </label>
                  <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                    {selectedBill.is_recurring && (
                      <span
                        style={{
                          background: "#e3f2fd",
                          color: "#1976d2",
                          padding: "0.25rem 0.75rem",
                          borderRadius: "4px",
                          fontSize: "0.85rem",
                          fontWeight: 600,
                        }}
                      >
                        RECURRING
                      </span>
                    )}
                    {selectedBill.is_emergency && (
                      <span
                        style={{
                          background: "#fff3e0",
                          color: "#f57c00",
                          padding: "0.25rem 0.75rem",
                          borderRadius: "4px",
                          fontSize: "0.85rem",
                          fontWeight: 600,
                        }}
                      >
                        EMERGENCY
                      </span>
                    )}
                    {!selectedBill.is_recurring && !selectedBill.is_emergency && (
                      <span
                        style={{
                          background: "#f5f5f5",
                          color: "#666",
                          padding: "0.25rem 0.75rem",
                          borderRadius: "4px",
                          fontSize: "0.85rem",
                          fontWeight: 600,
                        }}
                      >
                        ONE-TIME
                      </span>
                    )}
                  </div>
                </div>

                {selectedBill.is_recurring && selectedBill.recurrence_calendar && (
                  <div>
                    <label style={{ fontSize: "0.85rem", color: "#666", display: "block", marginBottom: "0.25rem" }}>
                      Recurrence Months
                    </label>
                    <div style={{ fontSize: "0.9rem" }}>
                      {selectedBill.recurrence_calendar.map((month: number) => {
                        const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
                        return monthNames[month - 1];
                      }).join(", ")}
                    </div>
                  </div>
                )}

                <div>
                  <label style={{ fontSize: "0.85rem", color: "#666", display: "block", marginBottom: "0.25rem" }}>
                    Payment Status
                  </label>
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                    <div>
                      {selectedBill.is_paid ? (
                        <span
                          style={{
                            background: "#e8f5e9",
                            color: "#2e7d32",
                            padding: "0.5rem 1rem",
                            borderRadius: "6px",
                            fontSize: "0.9rem",
                            fontWeight: 600,
                          }}
                        >
                          ✓ {selectedBill.is_recurring ? "CURRENT PAYMENT PAID" : "PAID"}
                        </span>
                      ) : (
                        <span
                          style={{
                            background: "#fff3e0",
                            color: "#f57c00",
                            padding: "0.5rem 1rem",
                            borderRadius: "6px",
                            fontSize: "0.9rem",
                            fontWeight: 600,
                          }}
                        >
                          ⏳ PENDING
                        </span>
                      )}
                    </div>
                    {selectedBill.is_recurring && selectedBill.recurrence_calendar && selectedBill.recurrence_calendar.length > 0 && (
                      <div style={{ fontSize: "0.85rem", color: "#666", marginTop: "0.25rem" }}>
                        {selectedBill.is_paid ? (
                          <>
                            Next payment will be automatically rescheduled after this one is paid.
                            <br />
                            Remaining payments: {selectedBill.recurrence_calendar.length - 1}
                          </>
                        ) : (
                          <>
                            This is payment 1 of {selectedBill.recurrence_calendar.length} scheduled payments.
                            <br />
                            After payment, bill will auto-reschedule to next month.
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: "0.85rem", color: "#666", display: "block", marginBottom: "0.25rem" }}>
                    Cycle ID
                  </label>
                  <div style={{ fontFamily: "monospace", fontSize: "0.9rem" }}>{selectedBill.cycle_id.toString()}</div>
                </div>
              </div>

              <div style={{ marginTop: "2rem", display: "flex", gap: "1rem", justifyContent: "flex-end", flexWrap: "wrap" }}>
                {!selectedBill.is_paid && (
                  <>
                    {selectedBill.is_recurring ? (
                      <>
                        <Button
                          variant="secondary"
                          size="md"
                          onClick={() => handleCancelBillOccurrence(selectedBill.id, true)}
                        >
                          <Icon.SkipForward size="sm" />
                          Skip Next Occurrence
                        </Button>
                        <Button
                          variant="error"
                          size="md"
                          onClick={() => handleCancelBillPermanently(selectedBill.id)}
                        >
                          <Icon.Trash01 size="sm" />
                          Delete Permanently
                        </Button>
                      </>
                    ) : (
                      <Button
                        variant="error"
                        size="md"
                        onClick={() => handleCancelBillOccurrence(selectedBill.id, false)}
                      >
                        <Icon.Trash01 size="sm" />
                        Delete Bill
                      </Button>
                    )}
                  </>
                )}
                <Button
                  variant="tertiary"
                  size="md"
                  onClick={() => {
                    setShowBillDetails(false);
                    setSelectedBill(null);
                  }}
                >
                  Close
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}