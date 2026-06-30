"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAppStore } from "@/stores/app-store";
import { useWallet } from "@/hooks/use-wallet";
import { createHyperliquidClients } from "@/lib/hyperliquid-client";
import { formatUSD } from "@/lib/utils";

// ─── Production contract addresses (Arbitrum One) ───────────────────────────
//
// Hyperliquid L1 Bridge — verified on Arbiscan:
//   https://arbiscan.io/address/0x2df1c51e09aecf9cacb7bc98cb1d57bc8e4ca6a2
const HL_BRIDGE = "0x2df1c51e09aecf9cacb7bc98cb1d57bc8e4ca6a2";

// Native USDC on Arbitrum One (Circle's own issuance, *not* bridged USDC.e):
//   https://arbiscan.io/token/0xaf88d065e77c8cc2239327c5edb3a432268e5831
const USDC_ARB = "0xaf88d065e77c8cc2239327c5edb3a432268e5831";

// Minimal ERC-20 ABI (approve + balanceOf)
const ERC20_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function balanceOf(address account) external view returns (uint256)",
  "function allowance(address owner, address spender) external view returns (uint256)",
];

// Hyperliquid Bridge ABI
// sendDeposit(address usd, uint64 amount) — amount in USDC micro-units (6 decimals)
const BRIDGE_ABI = [
  "function sendDeposit(address usd, uint64 amount) external",
];

type Mode = "deposit" | "withdraw";
type Step = "idle" | "approving" | "depositing" | "done";

interface DepositWithdrawModalProps {
  open: boolean;
  onClose: () => void;
}

export function DepositWithdrawModal({
  open,
  onClose,
}: DepositWithdrawModalProps) {
  const { wallet, hyperliquidWallet } = useWallet();
  const { showToast, accountInfo } = useAppStore();

  const [mode, setMode] = useState<Mode>("deposit");
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<Step>("idle");
  const [fieldError, setFieldError] = useState("");
  const [txHash, setTxHash] = useState("");

  // Create SDK clients when wallet is connected
  const clients = hyperliquidWallet ? createHyperliquidClients(hyperliquidWallet) : null;

  const withdrawable = parseFloat(accountInfo?.withdrawable ?? "0");
  const spotTotal = parseFloat(accountInfo?.spotTotal ?? "0");
  const perpTotal = parseFloat(accountInfo?.withdrawable ?? "0"); // perp withdrawable
  const parsedAmount = parseFloat(amount || "0");

  function validate(): string {
    if (!amount || parsedAmount <= 0) return "Enter a valid amount";
    if (parsedAmount < 5) return "Minimum amount is $5 USDC";
    if (mode === "withdraw" && parsedAmount > withdrawable)
      return `Max withdrawable: ${formatUSD(withdrawable)}`;
    return "";
  }

  // ── Deposit: approve USDC → sendDeposit on bridge ──────────────────────────
  async function handleDeposit() {
    if (!window.ethereum || !wallet.address) {
      showToast("No wallet connected", "error");
      return;
    }

    setLoading(true);
    setFieldError("");
    setStep("approving");

    try {
      // Dynamically import ethers to avoid SSR issues
      const { ethers } = await import("ethers");
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();

      // USDC has 6 decimals — convert USD amount to micro-units
      const usdcMicroUnits = BigInt(Math.floor(parsedAmount * 1_000_000));

      // ── Step 1: Approve bridge to spend USDC ──────────────────────────────
      showToast(`Approving ${parsedAmount.toFixed(2)} USDC…`, "info");
      const usdc = new ethers.Contract(USDC_ARB, ERC20_ABI, signer);

      // Check if existing allowance already covers the amount (saves a tx)
      const currentAllowance = (await usdc.allowance(
        wallet.address,
        HL_BRIDGE
      )) as bigint;

      if (currentAllowance < usdcMicroUnits) {
        const approveTx = await usdc.approve(HL_BRIDGE, usdcMicroUnits);
        await approveTx.wait();
      }

      // ── Step 2: Call sendDeposit on the bridge ────────────────────────────
      setStep("depositing");
      showToast("Approval confirmed. Depositing to Hyperliquid…", "info");

      const bridge = new ethers.Contract(HL_BRIDGE, BRIDGE_ABI, signer);
      const depositTx = await bridge.sendDeposit(USDC_ARB, usdcMicroUnits);
      const receipt = await depositTx.wait();

      setTxHash(receipt.hash);
      setStep("done");
      showToast(
        `Deposited ${formatUSD(parsedAmount)} USDC — arrives in ~1 min`,
        "success"
      );
      setAmount("");
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message.includes("user rejected") ||
            err.message.includes("User denied")
            ? "Transaction rejected"
            : err.message.slice(0, 160)
          : "Deposit failed";
      setFieldError(msg);
      showToast(msg, "error");
      setStep("idle");
    } finally {
      setLoading(false);
    }
  }

  // ── Withdraw: EIP-712 sign → POST to /exchange (via SDK) ────────────────────
  async function handleWithdraw() {
    if (!wallet.address) {
      showToast("No wallet connected", "error");
      return;
    }

    if (!clients) {
      showToast("Wallet client not ready", "error");
      return;
    }

    setLoading(true);
    setFieldError("");
    setStep("approving");

    try {
      // withdrawUsdc builds and signs the EIP-712 "HyperliquidTransaction:WithdrawFromBridge"
      // typed data (chainId 42161, Arbitrum), then POSTs to /exchange.
      // The user will see an eth_signTypedData_v4 prompt in their wallet.
      setStep("depositing");
      await clients.exchange.withdraw3({
        destination: wallet.address,
        amount: parsedAmount.toFixed(2),
      });

      // Withdrawals don't produce an Arbitrum tx hash immediately —
      // the Hyperliquid L2 processes the request and settles to Arbitrum.
      setTxHash("");
      setStep("done");
      showToast(
        `Withdrawal of ${formatUSD(parsedAmount)} USDC submitted — arrives in ~5 min`,
        "success"
      );
      setAmount("");
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message.includes("user rejected") ||
            err.message.includes("User denied")
            ? "Signature rejected"
            : err.message.slice(0, 160)
          : "Withdrawal failed";
      setFieldError(msg);
      showToast(msg, "error");
      setStep("idle");
    } finally {
      setLoading(false);
    }
  }

  // ── Transfer: Spot ↔ Perp (usdClassTransfer via SDK) ───────────────────────
  async function handleTransfer() {
    if (!wallet.address) {
      showToast("No wallet connected", "error");
      return;
    }

    if (!clients) {
      showToast("Wallet client not ready", "error");
      return;
    }

    setLoading(true);
    setFieldError("");
    setStep("approving");

    try {
      // Spot → Perp (toPerp: true) or Perp → Spot (toPerp: false)
      const toPerp = spotTotal > perpTotal; // Default direction: move from larger balance

      setStep("depositing");
      await clients.exchange.usdClassTransfer({
        amount: parsedAmount.toFixed(2),
        toPerp,
      });

      setTxHash(""); // No on-chain tx hash for internal transfer
      setStep("done");
      showToast(
        `${formatUSD(parsedAmount)} USDC transferred ${toPerp ? "to Perp" : "to Spot"}`,
        "success"
      );
      setAmount("");
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message.includes("user rejected") ||
            err.message.includes("User denied")
            ? "Signature rejected"
            : err.message.slice(0, 160)
          : "Transfer failed";
      setFieldError(msg);
      showToast(msg, "error");
      setStep("idle");
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit() {
    const err = validate();
    if (err) {
      setFieldError(err);
      return;
    }
    setFieldError("");
    if (mode === "deposit") handleDeposit();
    else handleWithdraw();
  }

  function handleClose() {
    setAmount("");
    setFieldError("");
    setStep("idle");
    setTxHash("");
    onClose();
  }

  // Step metadata
  const steps: { id: Step; label: string }[] =
    mode === "deposit"
      ? [
          { id: "approving", label: "Approve USDC spending" },
          { id: "depositing", label: "Send deposit to bridge" },
          { id: "done", label: "Confirmed on-chain" },
        ]
      : [
          { id: "approving", label: "Build withdraw request" },
          { id: "depositing", label: "Sign EIP-712 message" },
          { id: "done", label: "Submitted to Hyperliquid L2" },
        ];

  const stepIds = steps.map((s) => s.id);
  const currentStepIdx = stepIds.indexOf(step);

  return (
    <Modal open={open} onClose={handleClose} title="Funds">
      <div className="space-y-5">
        {/* Mode toggle */}
        <div className="grid grid-cols-2 rounded-xl overflow-hidden border border-[#334155]">
          {(["deposit", "withdraw"] as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => {
                setMode(m);
                setFieldError("");
                setStep("idle");
                setTxHash("");
              }}
              className={[
                "py-2.5 text-sm font-semibold capitalize transition-colors cursor-pointer",
                mode === m
                  ? "bg-[#F59E0B] text-[#0F172A]"
                  : "bg-[#1E293B] text-[#475569] hover:text-[#94A3B8]",
              ].join(" ")}
              aria-pressed={mode === m}
            >
              {m}
            </button>
          ))}
        </div>

        {/* Balances */}
        <div className="grid grid-cols-2 gap-3 rounded-xl bg-[#0F172A] border border-[#334155] p-3 text-[10px]">
          <div className="flex justify-between">
            <span className="text-[#475569]">Spot (USDC)</span>
            <span className="text-[#94A3B8] font-mono">{formatUSD(spotTotal)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#475569]">Perp (Available)</span>
            <span className="text-[#94A3B8] font-mono">{formatUSD(perpTotal)}</span>
          </div>
          {mode === "deposit" && (
            <div className="flex justify-between items-center">
              <span className="text-[#475569]">Bridge</span>
              <a
                href={`https://arbiscan.io/address/${HL_BRIDGE}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#F59E0B] hover:underline font-mono"
              >
                {HL_BRIDGE.slice(0, 10)}…{HL_BRIDGE.slice(-8)}
              </a>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-[#475569]">Network</span>
            <span className="text-[#94A3B8]">Arbitrum One (Chain 42161)</span>
          </div>
        </div>

        {/* Available balance for current mode */}
        {mode === "withdraw" && (
          <div className="flex justify-between text-xs">
            <span className="text-[#475569]">Available to withdraw</span>
            <button
              onClick={() => setAmount(withdrawable.toFixed(2))}
              className="text-[#F59E0B] font-medium hover:underline cursor-pointer"
            >
              {formatUSD(withdrawable)}
            </button>
          </div>
        )}

        {/* Amount input */}
        <Input
          label="Amount"
          type="number"
          placeholder="0.00"
          value={amount}
          onChange={(e) => {
            setAmount(e.target.value);
            setFieldError("");
          }}
          suffix="USDC"
          error={fieldError}
          min="5"
          step="1"
        />

        {/* Quick-fill amounts */}
        <div className="grid grid-cols-4 gap-1.5">
          {[100, 500, 1000, 5000].map((v) => (
            <button
              key={v}
              onClick={() => setAmount(String(v))}
              className="py-1.5 text-xs rounded-lg bg-[#1E293B] text-[#475569] hover:bg-[#272F42] hover:text-[#94A3B8] border border-[#334155] transition-colors cursor-pointer"
            >
              ${v.toLocaleString()}
            </button>
          ))}
        </div>

        {/* Progress steps (shown once the flow has started) */}
        {step !== "idle" && (
          <div className="rounded-xl bg-[#0F172A] border border-[#334155] p-4 space-y-3">
            {steps.map((s, i) => {
              const sIdx = stepIds.indexOf(s.id);
              const isDone = currentStepIdx > sIdx || step === "done";
              const isActive = step === s.id && step !== "done";
              return (
                <div key={s.id} className="flex items-center gap-3 text-sm">
                  <div
                    className={[
                      "w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold",
                      isDone
                        ? "bg-[#22C55E] text-white"
                        : isActive
                        ? "bg-[#F59E0B] text-[#0F172A]"
                        : "bg-[#334155] text-[#475569]",
                    ].join(" ")}
                    aria-hidden="true"
                  >
                    {isDone ? "✓" : i + 1}
                  </div>
                  <span
                    className={
                      isDone
                        ? "text-[#22C55E]"
                        : isActive
                        ? "text-[#F8FAFC]"
                        : "text-[#475569]"
                    }
                  >
                    {s.label}
                  </span>
                  {isActive && (
                    <span className="ml-auto">
                      <svg
                        className="animate-spin w-4 h-4 text-[#F59E0B]"
                        viewBox="0 0 24 24"
                        fill="none"
                        aria-label="Processing"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                        />
                      </svg>
                    </span>
                  )}
                </div>
              );
            })}

            {/* Arbiscan link — only available for deposit (has on-chain tx hash) */}
            {txHash && (
              <a
                href={`https://arbiscan.io/tx/${txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs text-[#F59E0B] hover:underline mt-1"
              >
                View on Arbiscan
                <svg
                  className="w-3 h-3"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                  />
                </svg>
              </a>
            )}

            {step === "done" && (
              <p className="text-[10px] text-[#475569] pt-1">
                {mode === "withdraw"
                  ? "Your withdrawal is queued on Hyperliquid L2. The on-chain settlement to Arbitrum usually takes ~5 minutes."
                  : mode === "deposit"
                  ? "Funds arrive on Hyperliquid in ~1 minute after on-chain confirmation."
                  : "Transfer complete. Spot/Perp balances updated."}
              </p>
            )}
          </div>
        )}

        {/* Submit button */}
        <Button
          variant="primary"
          size="lg"
          fullWidth
          loading={loading}
          onClick={handleSubmit}
          disabled={!wallet.isConnected || step === "done"}
        >
          {step === "done"
            ? "✓ Done"
            : mode === "deposit"
            ? `Deposit${parsedAmount > 0 ? ` ${formatUSD(parsedAmount)}` : ""} USDC`
            : mode === "withdraw"
            ? `Withdraw${parsedAmount > 0 ? ` ${formatUSD(parsedAmount)}` : ""} USDC`
            : `Transfer${parsedAmount > 0 ? ` ${formatUSD(parsedAmount)}` : ""} USDC`}
        </Button>

        {!wallet.isConnected && (
          <p className="text-center text-xs text-[#475569]">
            Connect your wallet first
          </p>
        )}

        <p className="text-[10px] text-[#475569] text-center leading-relaxed">
          {mode === "deposit"
            ? "Funds arrive on Hyperliquid in ~1 minute after on-chain confirmation."
            : mode === "withdraw"
            ? "Withdrawals are signed locally and settled by the Hyperliquid L2 in ~5 minutes."
            : "Transfers between Spot and Perp are instant within your unified account."}
        </p>
      </div>
    </Modal>
  );
}