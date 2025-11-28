import { useState, useEffect } from "react";
import { useWallet } from "../hooks/useWallet";
import * as LockedInContract from "lockedin";
import type { BillCategory } from "lockedin";
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
      <div className="container" style={{
        padding: '80px 24px 100px',
        textAlign: 'center',
        maxWidth: '500px',
        margin: '0 auto'
      }}>
        <div style={{
          width: '80px',
          height: '80px',
          margin: '0 auto 24px',
          background: 'linear-gradient(135deg, var(--color-primary), var(--color-primary-light))',
          borderRadius: 'var(--radius-xl)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '40px',
          boxShadow: 'var(--shadow-glow)'
        }}>
          🔒
        </div>
        <h1 style={{
          fontSize: '32px',
          fontWeight: 700,
          marginBottom: '12px',
          color: 'var(--color-text-primary)'
        }}>
          Welcome to LockedIn
        </h1>
        <p style={{
          fontSize: '16px',
          color: 'var(--color-text-secondary)',
          lineHeight: '1.6'
        }}>
          Get LockedIn to financial discipline. Connect your wallet to get started.
        </p>
      </div>
    );
  }

  return (
    <div className="container" style={{ padding: '24px 16px 96px', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ fontSize: '28px', fontWeight: 700, marginBottom: '8px', color: 'var(--color-text-primary)' }}>
          Dashboard
        </h1>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: '15px' }}>
          Manage your bill payment cycles and never miss a payment.
        </p>
      </div>

      {/* Bills Due Soon Notification */}
      {billsDueSoon.length > 0 && (
        <div style={{
          background: 'linear-gradient(135deg, #f87171 0%, #dc2626 100%)',
          color: 'white',
          padding: '20px',
          borderRadius: 'var(--radius-lg)',
          marginBottom: '32px',
          boxShadow: 'var(--shadow-md)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
            <span style={{ fontSize: '24px' }}>⚠️</span>
            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>
              {billsDueSoon.length} Bill{billsDueSoon.length > 1 ? 's' : ''} Due Soon!
            </h3>
          </div>
          <div style={{ paddingLeft: '36px' }}>
            {billsDueSoon.map((bill, idx) => (
              <div key={idx} style={{
                marginBottom: idx < billsDueSoon.length - 1 ? '8px' : 0,
                fontSize: '14px',
                opacity: 0.95
              }}>
                <strong>{bill.name}</strong> - {(Number(bill.amount) / 10_000_000).toFixed(2)} USDC
                {" "}({bill.hoursUntilDue}h remaining)
              </div>
            ))}
          </div>
          <div style={{
            marginTop: '12px',
            paddingLeft: '36px',
            fontSize: '13px',
            opacity: 0.9
          }}>
            💡 These bills will be automatically paid on their due date by the keeper service.
          </div>
        </div>
      )}

      {/* Section Tabs */}
      <div style={{
        display: 'flex',
        gap: '12px',
        marginBottom: '32px',
        borderBottom: '2px solid var(--color-border)',
        paddingBottom: '0'
      }}>
        <button
          onClick={() => setActiveSection("cycles")}
          style={{
            background: 'transparent',
            border: 'none',
            padding: '12px 20px',
            fontSize: '15px',
            fontWeight: 600,
            color: activeSection === "cycles" ? 'var(--color-primary)' : 'var(--color-text-secondary)',
            cursor: 'pointer',
            borderBottom: `3px solid ${activeSection === "cycles" ? 'var(--color-primary)' : 'transparent'}`,
            marginBottom: '-2px',
            transition: 'var(--transition-base)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <span>📋</span>
          My Cycles ({cycles.length})
        </button>
        <button
          onClick={() => setActiveSection("create")}
          style={{
            background: 'transparent',
            border: 'none',
            padding: '12px 20px',
            fontSize: '15px',
            fontWeight: 600,
            color: activeSection === "create" ? 'var(--color-primary)' : 'var(--color-text-secondary)',
            cursor: 'pointer',
            borderBottom: `3px solid ${activeSection === "create" ? 'var(--color-primary)' : 'transparent'}`,
            marginBottom: '-2px',
            transition: 'var(--transition-base)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <span>➕</span>
          Create New Cycle
        </button>
      </div>

      {/* Cycles Section */}
      {activeSection === "cycles" && (
        <div>
          {loading ? (
            <div style={{
              backgroundColor: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-lg)',
              padding: '48px',
              textAlign: 'center',
              color: 'var(--color-text-secondary)'
            }}>
              Loading cycles...
            </div>
          ) : cycles.length === 0 ? (
            <div style={{
              backgroundColor: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-lg)',
              padding: '48px',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '48px', marginBottom: '16px' }}>📭</div>
              <h3 style={{ fontSize: '20px', fontWeight: 600, marginBottom: '8px', color: 'var(--color-text-primary)' }}>
                No Cycles Yet
              </h3>
              <p style={{ color: 'var(--color-text-secondary)', marginBottom: '24px', fontSize: '14px' }}>
                Create your first bill payment cycle to get started.
              </p>
              <button
                onClick={() => setActiveSection("create")}
                style={{
                  background: 'linear-gradient(135deg, var(--color-primary), var(--color-primary-light))',
                  color: '#0f1419',
                  border: 'none',
                  padding: '12px 24px',
                  borderRadius: 'var(--radius-md)',
                  fontSize: '15px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  transition: 'var(--transition-base)',
                  boxShadow: 'var(--shadow-glow)'
                }}
                onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-2px)'}
                onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
              >
                <span>➕</span>
                Create First Cycle
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {cycles.map((cycleId) => (
                <CycleCard key={cycleId.toString()} cycleId={cycleId} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Create Cycle Section */}
      {activeSection === "create" && (
        <div style={{
          backgroundColor: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-lg)',
          padding: '32px'
        }}>
          <h2 style={{ fontSize: '22px', fontWeight: 700, marginBottom: '24px', color: 'var(--color-text-primary)' }}>
            Create New Cycle
          </h2>

          <div style={{ marginBottom: '24px' }}>
            <label style={{
              display: 'block',
              marginBottom: '8px',
              fontWeight: 600,
              fontSize: '14px',
              color: 'var(--color-text-primary)'
            }}>
              Duration (months)
            </label>
            <input
              type="number"
              min="1"
              max="12"
              value={durationMonths}
              onChange={(e) => setDurationMonths(e.target.value)}
              placeholder="3"
              style={{
                width: '100%',
                padding: '12px',
                fontSize: '15px',
                backgroundColor: 'var(--color-bg-secondary)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--color-text-primary)',
                transition: 'var(--transition-base)'
              }}
            />
            <small style={{ color: 'var(--color-text-tertiary)', marginTop: '6px', display: 'block', fontSize: '13px' }}>
              Choose between 1-12 months
            </small>
          </div>

          <div style={{ marginBottom: '24px' }}>
            <label style={{
              display: 'block',
              marginBottom: '8px',
              fontWeight: 600,
              fontSize: '14px',
              color: 'var(--color-text-primary)'
            }}>
              Deposit Amount (USDC)
            </label>
            <input
              type="number"
              step="0.01"
              value={depositAmount}
              onChange={(e) => setDepositAmount(e.target.value)}
              placeholder="100.00"
              style={{
                width: '100%',
                padding: '12px',
                fontSize: '15px',
                backgroundColor: 'var(--color-bg-secondary)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--color-text-primary)',
                transition: 'var(--transition-base)'
              }}
            />
            <small style={{ color: 'var(--color-text-tertiary)', marginTop: '6px', display: 'block', fontSize: '13px' }}>
              Amount to lock for bill payments (2% fee will be deducted)
            </small>
          </div>

          {depositAmount && (
            <div style={{
              background: 'var(--color-bg-secondary)',
              padding: '20px',
              borderRadius: 'var(--radius-md)',
              marginBottom: '24px',
              border: '1px solid var(--color-border)'
            }}>
              <h4 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px', color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Summary
              </h4>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '14px' }}>
                <span style={{ color: 'var(--color-text-secondary)' }}>Deposit:</span>
                <span style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>{parseFloat(depositAmount).toFixed(2)} USDC</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '14px' }}>
                <span style={{ color: 'var(--color-text-secondary)' }}>Fee (2%):</span>
                <span style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>{(parseFloat(depositAmount) * 0.02).toFixed(2)} USDC</span>
              </div>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                paddingTop: '12px',
                borderTop: '1px solid var(--color-border)',
                marginTop: '8px'
              }}>
                <span style={{ fontWeight: 600, color: 'var(--color-text-primary)', fontSize: '15px' }}>Available for bills:</span>
                <span style={{ fontWeight: 700, color: 'var(--color-primary)', fontSize: '16px' }}>{(parseFloat(depositAmount) * 0.98).toFixed(2)} USDC</span>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <button
              onClick={handleCreateCycle}
              disabled={loading || !depositAmount || parseFloat(depositAmount) <= 0}
              style={{
                background: loading || !depositAmount || parseFloat(depositAmount) <= 0
                  ? 'var(--color-border)'
                  : 'linear-gradient(135deg, var(--color-primary), var(--color-primary-light))',
                color: loading || !depositAmount || parseFloat(depositAmount) <= 0
                  ? 'var(--color-text-tertiary)'
                  : '#0f1419',
                border: 'none',
                padding: '12px 24px',
                borderRadius: 'var(--radius-md)',
                fontSize: '15px',
                fontWeight: 600,
                cursor: loading || !depositAmount || parseFloat(depositAmount) <= 0 ? 'not-allowed' : 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                transition: 'var(--transition-base)',
                boxShadow: loading || !depositAmount || parseFloat(depositAmount) <= 0 ? 'none' : 'var(--shadow-glow)'
              }}
            >
              <span>🔒</span>
              {loading ? 'Creating...' : 'Lock Funds & Create Cycle'}
            </button>
            <button
              onClick={() => setActiveSection("cycles")}
              disabled={loading}
              style={{
                background: 'transparent',
                color: 'var(--color-text-secondary)',
                border: '1px solid var(--color-border)',
                padding: '12px 24px',
                borderRadius: 'var(--radius-md)',
                fontSize: '15px',
                fontWeight: 600,
                cursor: loading ? 'not-allowed' : 'pointer',
                transition: 'var(--transition-base)'
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

interface BillForm {
  name: string;
  amount: string;
  dueDate: string;
  isRecurring: boolean;
  recurrenceDays: number[];
  isEmergency: boolean;
  category: string;
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
      isEmergency: false,
      category: "Other"
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

  const handleSkipBill = async (billId: bigint) => {
    if (!address || !signTransaction) return;

    const confirmMessage = `Skip the next occurrence of this recurring bill?\n\n` +
      `The bill will remain in your cycle but the next payment will be skipped.\n` +
      `Note: You can only make one adjustment per month.`;

    const confirmSkip = window.confirm(confirmMessage);
    if (!confirmSkip) return;

    try {
      const contract = new LockedInContract.Client({
        ...LockedInContract.networks.testnet,
        rpcUrl,
        publicKey: address,
      });

      const tx = await contract.skip_bill({ bill_id: billId });

      await tx.signAndSend({
        signTransaction: async (xdr: string) => {
          return await signTransaction(xdr, {
            networkPassphrase: "Test SDF Network ; September 2015",
          });
        },
      });

      alert("Successfully skipped next occurrence! The bill will still recur in future months.");
      setShowBillDetails(false);
      setSelectedBill(null);
      await loadCycleBills();
      await loadCycleData();
    } catch (error: any) {
      console.error("Error skipping bill:", error);

      let errorMsg = "Failed to skip bill";
      if (error.message?.includes("MonthlyAdjustmentLimitReached")) {
        errorMsg = "You have already made a bill adjustment this month. You can only add/cancel one bill per month.";
      } else if (error.message) {
        errorMsg = error.message;
      }

      alert(errorMsg);
    }
  };

  const handleDeleteBill = async (billId: bigint) => {
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

      const tx = await contract.delete_bill({ bill_id: billId });

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
        const cycleStartDate = new Date(Number(startDateTimestamp) * 1000);
        const cycleEndDate = new Date(Number(endDateTimestamp) * 1000);
        const billDueDate = new Date(bill.dueDate);
        const dayOfMonth = billDueDate.getDate();

        // Calculate the first due date within the cycle
        let firstDueDate: Date;
        if (bill.isRecurring) {
          // For recurring bills, find the first occurrence within the cycle
          let currentDate = new Date(cycleStartDate);
          firstDueDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), dayOfMonth);

          // If the first occurrence is before the cycle start, move to next month
          if (firstDueDate < cycleStartDate) {
            firstDueDate.setMonth(firstDueDate.getMonth() + 1);
          }

          // Ensure it's within the cycle
          if (firstDueDate > cycleEndDate) {
            firstDueDate = cycleEndDate; // Fallback to cycle end date
          }
        } else {
          // For one-time bills, use the selected date but clamp it to cycle bounds
          firstDueDate = new Date(billDueDate);
          if (firstDueDate < cycleStartDate) {
            firstDueDate = cycleStartDate;
          } else if (firstDueDate > cycleEndDate) {
            firstDueDate = cycleEndDate;
          }
        }

        const dueDateTimestamp = BigInt(Math.floor(firstDueDate.getTime() / 1000));

        let recurrenceCalendar: number[] = [];
        if (bill.isRecurring) {
          const monthsSet = new Set<number>();
          let currentDate = new Date(cycleStartDate);

          while (currentDate <= cycleEndDate) {
            const currentMonth = currentDate.getMonth() + 1;
            const currentYear = currentDate.getFullYear();

            const potentialDueDate = new Date(currentYear, currentMonth - 1, dayOfMonth);

            if (potentialDueDate >= cycleStartDate && potentialDueDate <= cycleEndDate) {
              monthsSet.add(currentMonth);
            }

            currentDate.setMonth(currentDate.getMonth() + 1);
          }

          recurrenceCalendar = Array.from(monthsSet).sort((a, b) => a - b);
        }

        // Use the user-selected category from the dropdown
        const category: BillCategory = { tag: bill.category as any, values: void 0 };

        return [bill.name, amountInStroops, dueDateTimestamp, bill.isRecurring, recurrenceCalendar, category];

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
      <div style={{
        backgroundColor: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-lg)',
        padding: '24px'
      }}>
        <p style={{ color: 'var(--color-text-secondary)' }}>Loading...</p>
      </div>
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
    <div style={{
      backgroundColor: 'var(--color-surface)',
      border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius-lg)',
      padding: '24px',
      transition: 'var(--transition-base)'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '20px' }}>
        <div>
          <h3 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '8px', color: 'var(--color-text-primary)' }}>
            Cycle #{cycleId.toString()}
          </h3>
          <div style={{ display: 'flex', gap: '16px', fontSize: '14px', color: 'var(--color-text-secondary)' }}>
            <span>📅 {startDate.toLocaleDateString()} - {endDate.toLocaleDateString()}</span>
          </div>
        </div>
        <div style={{
          background: cycleData.is_active
            ? 'linear-gradient(135deg, rgba(0, 217, 179, 0.15), rgba(0, 255, 204, 0.15))'
            : 'var(--color-bg-secondary)',
          color: cycleData.is_active ? 'var(--color-primary)' : 'var(--color-text-tertiary)',
          padding: '6px 14px',
          borderRadius: 'var(--radius-xl)',
          fontSize: '12px',
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          border: `1px solid ${cycleData.is_active ? 'var(--color-primary)' : 'var(--color-border)'}`
        }}>
          {cycleData.is_active ? "Active" : "Ended"}
        </div>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
        gap: '16px',
        marginTop: '20px'
      }}>
        <div>
          <div style={{ fontSize: '12px', color: 'var(--color-text-tertiary)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Deposited
          </div>
          <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--color-text-primary)' }}>
            {depositedUSDC} USDC
          </div>
        </div>
        <div>
          <div style={{ fontSize: '12px', color: 'var(--color-text-tertiary)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Allocated
          </div>
          <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--color-text-primary)' }}>
            {allocatedUSDC} USDC
          </div>
        </div>
        <div>
          <div style={{ fontSize: '12px', color: 'var(--color-text-tertiary)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Remaining
          </div>
          <div style={{
            fontSize: '20px',
            fontWeight: 700,
            color: remainingStroops < 0 ? 'var(--color-error)' : 'var(--color-success)'
          }}>
            {remainingUSDC} USDC
          </div>
        </div>
        <div>
          <div style={{ fontSize: '12px', color: 'var(--color-text-tertiary)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Fee ({feeRate}%)
          </div>
          <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--color-text-primary)' }}>
            {feeUSDC} USDC
          </div>
        </div>
      </div>

      <div style={{ marginTop: '24px', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
        <button
          onClick={() => {
            setShowBillsList(!showBillsList);
            if (!showBillsList) loadCycleBills();
          }}
          style={{
            background: 'transparent',
            color: 'var(--color-text-primary)',
            border: '1px solid var(--color-border)',
            padding: '10px 18px',
            borderRadius: 'var(--radius-md)',
            fontSize: '14px',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            transition: 'var(--transition-base)'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'var(--color-surface-hover)';
            e.currentTarget.style.borderColor = 'var(--color-border-hover)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent';
            e.currentTarget.style.borderColor = 'var(--color-border)';
          }}
        >
          <span>📋</span>
          {showBillsList ? "Hide Bills" : "Manage Bills"}
        </button>
        {cycleData.is_active && (
          <button
            onClick={() => {
              setShowAddBills(true);
              if (bills.length === 0) addNewBillForm();
            }}
            style={{
              background: 'linear-gradient(135deg, var(--color-primary), var(--color-primary-light))',
              color: '#0f1419',
              border: 'none',
              padding: '10px 18px',
              borderRadius: 'var(--radius-md)',
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              transition: 'var(--transition-base)',
              boxShadow: 'var(--shadow-glow)'
            }}
            onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-2px)'}
            onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
          >
            <span>➕</span>
            Add Bills
          </button>
        )}
      </div>

      {/* Add Bills Section - Continue in next message due to length */}
      {showAddBills && (
        <div style={{
          marginTop: '24px',
          padding: '24px',
          background: 'var(--color-bg-secondary)',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--color-border)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
            <h4 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--color-text-primary)' }}>
              Add Bills to Cycle
            </h4>
            <button
              onClick={addNewBillForm}
              style={{
                background: 'transparent',
                color: 'var(--color-primary)',
                border: '1px solid var(--color-primary)',
                padding: '8px 16px',
                borderRadius: 'var(--radius-md)',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                transition: 'var(--transition-base)'
              }}
            >
              <span>➕</span>
              Add Bill
            </button>
          </div>

          {bills.map((bill, index) => (
            <div key={index} style={{
              marginBottom: '20px',
              padding: '20px',
              background: 'var(--color-surface)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-border)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h5 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                  Bill #{index + 1}
                </h5>
                <button
                  onClick={() => removeBillForm(index)}
                  style={{
                    background: 'transparent',
                    color: 'var(--color-error)',
                    border: '1px solid var(--color-error)',
                    padding: '6px 12px',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    transition: 'var(--transition-base)'
                  }}
                >
                  <span>🗑️</span>
                  Remove
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                    Bill Name *
                  </label>
                  <input
                    placeholder="e.g., Netflix, Rent, Electricity"
                    value={bill.name}
                    onChange={(e) => updateBillForm(index, "name", e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px',
                      fontSize: '14px',
                      backgroundColor: 'var(--color-bg-primary)',
                      border: '1px solid var(--color-border)',
                      borderRadius: 'var(--radius-md)',
                      color: 'var(--color-text-primary)',
                      transition: 'var(--transition-base)'
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                    Category *
                  </label>
                  <select
                    value={bill.category}
                    onChange={(e) => updateBillForm(index, "category", e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px',
                      fontSize: '14px',
                      backgroundColor: 'var(--color-bg-primary)',
                      border: '1px solid var(--color-border)',
                      borderRadius: 'var(--radius-md)',
                      color: 'var(--color-text-primary)',
                      transition: 'var(--transition-base)',
                      cursor: 'pointer'
                    }}
                  >
                    <option value="Housing">🏠 Housing</option>
                    <option value="Utilities">💡 Utilities</option>
                    <option value="Transportation">🚗 Transportation</option>
                    <option value="Food">🍔 Food</option>
                    <option value="Healthcare">🏥 Healthcare</option>
                    <option value="Insurance">🛡️ Insurance</option>
                    <option value="Entertainment">🎬 Entertainment</option>
                    <option value="Education">📚 Education</option>
                    <option value="Debt">💳 Debt</option>
                    <option value="Other">📦 Other</option>
                  </select>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                      Amount (USDC) *
                    </label>
                    <input
                      type="number"
                      placeholder="0.00"
                      value={bill.amount}
                      onChange={(e) => updateBillForm(index, "amount", e.target.value)}
                      style={{
                        width: '100%',
                        padding: '10px',
                        fontSize: '14px',
                        backgroundColor: 'var(--color-bg-primary)',
                        border: '1px solid var(--color-border)',
                        borderRadius: 'var(--radius-md)',
                        color: 'var(--color-text-primary)',
                        transition: 'var(--transition-base)'
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                      Due Date * (day 1-28 only)
                    </label>
                    <input
                      type="date"
                      value={bill.dueDate}
                      onChange={(e) => {
                        const selectedDate = new Date(e.target.value);
                        const dayOfMonth = selectedDate.getDate();

                        if (dayOfMonth < 1 || dayOfMonth > 28) {
                          alert("Due date must be between day 1-28 of the month.\n\nThis ensures recurring bills work in all months including February (which has only 28 days).");
                          return;
                        }

                        updateBillForm(index, "dueDate", e.target.value);
                      }}
                      style={{
                        width: '100%',
                        padding: '10px',
                        fontSize: '14px',
                        backgroundColor: 'var(--color-bg-primary)',
                        border: '1px solid var(--color-border)',
                        borderRadius: 'var(--radius-md)',
                        color: 'var(--color-text-primary)',
                        transition: 'var(--transition-base)'
                      }}
                    />
                    <small style={{ color: 'var(--color-text-tertiary)', fontSize: '12px', marginTop: '4px', display: 'block' }}>
                      Must be day 1-28 (ensures recurring bills work in all months)
                    </small>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={bill.isRecurring}
                      onChange={(e) => updateBillForm(index, "isRecurring", e.target.checked)}
                      style={{ cursor: 'pointer' }}
                    />
                    <span style={{ fontSize: '14px', color: 'var(--color-text-primary)' }}>Recurring monthly bill</span>
                  </label>
                  {bill.isRecurring && bill.dueDate && (
                    <small style={{ color: 'var(--color-text-tertiary)', fontSize: '12px', marginLeft: '24px' }}>
                      Will repeat on the {new Date(bill.dueDate).getDate()}{getDaySuffix(new Date(bill.dueDate).getDate())} of every month
                    </small>
                  )}

                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={bill.isEmergency}
                      onChange={(e) => updateBillForm(index, "isEmergency", e.target.checked)}
                      style={{ cursor: 'pointer' }}
                    />
                    <span style={{ fontSize: '14px', color: 'var(--color-text-primary)' }}>Emergency bill</span>
                  </label>
                  {bill.isEmergency && (
                    <small style={{ color: 'var(--color-text-tertiary)', fontSize: '12px', marginLeft: '24px' }}>
                      No waiting period, can only add 1 per month
                    </small>
                  )}
                </div>
              </div>
            </div>
          ))}

          <div style={{ display: 'flex', gap: '12px', marginTop: '16px', flexWrap: 'wrap' }}>
            <button
              onClick={handleSubmitBills}
              style={{
                background: 'linear-gradient(135deg, var(--color-primary), var(--color-primary-light))',
                color: '#0f1419',
                border: 'none',
                padding: '10px 20px',
                borderRadius: 'var(--radius-md)',
                fontSize: '14px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'var(--transition-base)',
                boxShadow: 'var(--shadow-glow)'
              }}
            >
              Submit All Bills
            </button>
            <button
              onClick={() => {
                setShowAddBills(false);
                setBills([]);
              }}
              style={{
                background: 'transparent',
                color: 'var(--color-text-secondary)',
                border: '1px solid var(--color-border)',
                padding: '10px 20px',
                borderRadius: 'var(--radius-md)',
                fontSize: '14px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'var(--transition-base)'
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Bills List */}
      {showBillsList && (
        <div style={{
          marginTop: '24px',
          padding: '24px',
          background: 'var(--color-bg-secondary)',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--color-border)'
        }}>
          <h4 style={{ marginBottom: '20px', fontSize: '16px', fontWeight: 700, color: 'var(--color-text-primary)' }}>
            Bills in this Cycle
          </h4>

          {cycleBills.length === 0 ? (
            <p style={{ color: 'var(--color-text-secondary)', fontSize: '14px' }}>No bills added yet</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
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
                      padding: '16px',
                      background: 'var(--color-surface)',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--color-border)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      cursor: 'pointer',
                      transition: 'var(--transition-base)',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = 'var(--color-surface-hover)';
                      e.currentTarget.style.borderColor = 'var(--color-border-hover)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'var(--color-surface)';
                      e.currentTarget.style.borderColor = 'var(--color-border)';
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' }}>
                        <h5 style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                          {bill.name}
                        </h5>
                        {isRecurring && (
                          <span style={{
                            background: 'rgba(96, 165, 250, 0.15)',
                            color: 'var(--color-info)',
                            padding: '2px 8px',
                            borderRadius: 'var(--radius-sm)',
                            fontSize: '11px',
                            fontWeight: 700,
                            textTransform: 'uppercase',
                            letterSpacing: '0.5px'
                          }}>
                            RECURRING
                          </span>
                        )}
                        {isEmergency && (
                          <span style={{
                            background: 'rgba(245, 158, 11, 0.15)',
                            color: 'var(--color-warning)',
                            padding: '2px 8px',
                            borderRadius: 'var(--radius-sm)',
                            fontSize: '11px',
                            fontWeight: 700,
                            textTransform: 'uppercase',
                            letterSpacing: '0.5px'
                          }}>
                            EMERGENCY
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>
                        <span style={{ fontWeight: 600 }}>{amount} USDC</span>
                        {" • "}
                        Due: {dueDate.toLocaleDateString()}
                      </div>
                    </div>

                    <div>
                      {isPaid ? (
                        <span style={{
                          background: 'rgba(0, 217, 179, 0.15)',
                          color: 'var(--color-success)',
                          padding: '8px 16px',
                          borderRadius: 'var(--radius-md)',
                          fontSize: '12px',
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          letterSpacing: '0.5px'
                        }}>
                          ✓ PAID
                        </span>
                      ) : (
                        <span style={{
                          background: 'rgba(245, 158, 11, 0.15)',
                          color: 'var(--color-warning)',
                          padding: '8px 16px',
                          borderRadius: 'var(--radius-md)',
                          fontSize: '12px',
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          letterSpacing: '0.5px'
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

      {/* Bill Details Modal */}
      {showBillDetails && selectedBill && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0, 0, 0, 0.7)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            backdropFilter: 'blur(4px)'
          }}
          onClick={() => {
            setShowBillDetails(false);
            setSelectedBill(null);
          }}
        >
          <div
            style={{
              background: "var(--color-surface)",
              borderRadius: "var(--radius-lg)",
              padding: "32px",
              maxWidth: "500px",
              width: "90%",
              maxHeight: "80vh",
              overflow: "auto",
              border: '1px solid var(--color-border)',
              boxShadow: 'var(--shadow-lg)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ marginTop: 0, marginBottom: '24px', fontSize: '20px', fontWeight: 700, color: 'var(--color-text-primary)' }}>
              Bill Details
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ fontSize: '12px', color: 'var(--color-text-tertiary)', display: 'block', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Bill ID
                </label>
                <div style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>{selectedBill.id.toString()}</div>
              </div>

              <div>
                <label style={{ fontSize: '12px', color: 'var(--color-text-tertiary)', display: 'block', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Name
                </label>
                <div style={{ fontWeight: 600, fontSize: '16px', color: 'var(--color-text-primary)' }}>{selectedBill.name}</div>
              </div>

              <div>
                <label style={{ fontSize: '12px', color: 'var(--color-text-tertiary)', display: 'block', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Amount per Payment
                </label>
                <div style={{ fontWeight: 700, fontSize: '24px', color: 'var(--color-primary)' }}>
                  {(Number(selectedBill.amount) / 10_000_000).toFixed(2)} USDC
                </div>
              </div>

              {selectedBill.is_recurring && selectedBill.recurrence_calendar && selectedBill.recurrence_calendar.length > 0 && (
                <div>
                  <label style={{ fontSize: '12px', color: 'var(--color-text-tertiary)', display: 'block', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Total Allocated (All Payments)
                  </label>
                  <div style={{ fontWeight: 600, fontSize: '18px', color: 'var(--color-info)' }}>
                    {((Number(selectedBill.amount) * selectedBill.recurrence_calendar.length) / 10_000_000).toFixed(2)} USDC
                    <span style={{ fontSize: '13px', fontWeight: "normal", color: 'var(--color-text-secondary)' }}>
                      {" "}({selectedBill.recurrence_calendar.length} payment{selectedBill.recurrence_calendar.length > 1 ? "s" : ""})
                    </span>
                  </div>
                </div>
              )}

              <div>
                <label style={{ fontSize: '12px', color: 'var(--color-text-tertiary)', display: 'block', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Due Date
                </label>
                <div style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>
                  {new Date(Number(selectedBill.due_date) * 1000).toLocaleDateString()} at{" "}
                  {new Date(Number(selectedBill.due_date) * 1000).toLocaleTimeString()}
                </div>
              </div>

              <div>
                <label style={{ fontSize: '12px', color: 'var(--color-text-tertiary)', display: 'block', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Type
                </label>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {selectedBill.is_recurring && (
                    <span style={{
                      background: 'rgba(96, 165, 250, 0.15)',
                      color: 'var(--color-info)',
                      padding: '4px 12px',
                      borderRadius: 'var(--radius-sm)',
                      fontSize: '12px',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px'
                    }}>
                      RECURRING
                    </span>
                  )}
                  {selectedBill.is_emergency && (
                    <span style={{
                      background: 'rgba(245, 158, 11, 0.15)',
                      color: 'var(--color-warning)',
                      padding: '4px 12px',
                      borderRadius: 'var(--radius-sm)',
                      fontSize: '12px',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px'
                    }}>
                      EMERGENCY
                    </span>
                  )}
                  {!selectedBill.is_recurring && !selectedBill.is_emergency && (
                    <span style={{
                      background: 'var(--color-bg-secondary)',
                      color: 'var(--color-text-secondary)',
                      padding: '4px 12px',
                      borderRadius: 'var(--radius-sm)',
                      fontSize: '12px',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px'
                    }}>
                      ONE-TIME
                    </span>
                  )}
                </div>
              </div>

              {selectedBill.is_recurring && selectedBill.recurrence_calendar && (
                <div>
                  <label style={{ fontSize: '12px', color: 'var(--color-text-tertiary)', display: 'block', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Recurrence Months
                  </label>
                  <div style={{ fontSize: '14px', color: 'var(--color-text-primary)' }}>
                    {selectedBill.recurrence_calendar.map((month: number) => {
                      const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
                      return monthNames[month - 1];
                    }).join(", ")}
                  </div>
                </div>
              )}

              <div>
                <label style={{ fontSize: '12px', color: 'var(--color-text-tertiary)', display: 'block', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Payment Status
                </label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div>
                    {selectedBill.is_paid ? (
                      <span style={{
                        background: 'rgba(0, 217, 179, 0.15)',
                        color: 'var(--color-success)',
                        padding: '10px 16px',
                        borderRadius: 'var(--radius-md)',
                        fontSize: '13px',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px',
                        display: 'inline-block'
                      }}>
                        ✓ {selectedBill.is_recurring ? "CURRENT PAYMENT PAID" : "PAID"}
                      </span>
                    ) : (
                      <span style={{
                        background: 'rgba(245, 158, 11, 0.15)',
                        color: 'var(--color-warning)',
                        padding: '10px 16px',
                        borderRadius: 'var(--radius-md)',
                        fontSize: '13px',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px',
                        display: 'inline-block'
                      }}>
                        ⏳ PENDING
                      </span>
                    )}
                  </div>
                  {selectedBill.is_recurring && selectedBill.recurrence_calendar && selectedBill.recurrence_calendar.length > 0 && (
                    <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
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
                <label style={{ fontSize: '12px', color: 'var(--color-text-tertiary)', display: 'block', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Cycle ID
                </label>
                <div style={{ fontFamily: 'monospace', fontSize: '13px', color: 'var(--color-text-primary)' }}>
                  {selectedBill.cycle_id.toString()}
                </div>
              </div>
            </div>

            <div style={{ marginTop: '32px', display: 'flex', gap: '12px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              {!selectedBill.is_paid && (
                <>
                  {selectedBill.is_recurring ? (
                    <>
                      <button
                        onClick={() => handleSkipBill(selectedBill.id)}
                        style={{
                          background: 'transparent',
                          color: 'var(--color-text-primary)',
                          border: '1px solid var(--color-border)',
                          padding: '10px 16px',
                          borderRadius: 'var(--radius-md)',
                          fontSize: '13px',
                          fontWeight: 600,
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          transition: 'var(--transition-base)'
                        }}
                      >
                        <span>⏭️</span>
                        Skip Next Occurrence
                      </button>
                      <button
                        onClick={() => handleDeleteBill(selectedBill.id)}
                        style={{
                          background: 'rgba(248, 113, 113, 0.15)',
                          color: 'var(--color-error)',
                          border: '1px solid var(--color-error)',
                          padding: '10px 16px',
                          borderRadius: 'var(--radius-md)',
                          fontSize: '13px',
                          fontWeight: 600,
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          transition: 'var(--transition-base)'
                        }}
                      >
                        <span>🗑️</span>
                        Delete Permanently
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => handleDeleteBill(selectedBill.id)}
                      style={{
                        background: 'rgba(248, 113, 113, 0.15)',
                        color: 'var(--color-error)',
                        border: '1px solid var(--color-error)',
                        padding: '10px 16px',
                        borderRadius: 'var(--radius-md)',
                        fontSize: '13px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        transition: 'var(--transition-base)'
                      }}
                    >
                      <span>🗑️</span>
                      Delete Bill
                    </button>
                  )}
                </>
              )}
              <button
                onClick={() => {
                  setShowBillDetails(false);
                  setSelectedBill(null);
                }}
                style={{
                  background: 'var(--color-primary)',
                  color: '#0f1419',
                  border: 'none',
                  padding: '10px 16px',
                  borderRadius: 'var(--radius-md)',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'var(--transition-base)'
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
