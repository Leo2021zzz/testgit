// 使用注意事项：
// - 本脚本用于从 Polymarket 的 Safe(proxy) 钱包提现 USDC.e 到你的 EOA。
// - 流程：先调用 /withdraw 生成桥地址，再由 Safe 转账 USDC.e 到桥地址。
// - 需要保证 Safe 内有足够 USDC.e 余额，否则转账会失败。
// - 目标链默认 Polygon(137)，目标代币默认为 USDC.e。
// - 需添加'提现金额'变量 WITHDRAW_AMOUNT，如果值为 `5.25`，即提现5.25u
// - RECIPIENT_ADDR 为空或为 "0" 时，默认用 SECRETKEY 推导的 EOA 地址。
// - _NUM 参数用于选择环境变量后缀（例如 _1 对应 SECRETKEY_1）。
// - 使用 Safe SDK v3+ 初始化方式（Safe.init），无需 EthersAdapter。

import axios from "axios";
import { Wallet, ethers } from "ethers";
import Safe from "@safe-global/protocol-kit";
import { OperationType } from "@safe-global/types-kit";

// 固定常量（不再通过环境变量覆盖）
const BRIDGE_BASE_URL = "https://bridge.polymarket.com";
const POLYGON_RPC = "https://polygon-rpc.com";
const FROM_TOKEN_ADDRESS = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174"; // Safe 转出的代币合约，默认为 USDC.e
const TO_CHAIN_ID = "137"; // 收款链的 ID，默认137为 Polygon
const TO_TOKEN_ADDRESS = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174"; // 希望收款到的代币，默认为 USDC.e

// 读取参数：_NUM 用于选择环境变量后缀
const args = process.argv.slice(2);
console.log("使用参数:", args[0]);
let _NUM = "";
if (args[0]) _NUM = args[0];

function getEnv(name, suffix) {
  const key = suffix ? `${name}${suffix}` : name;
  return process.env[key] || null;
}

function requireEnv(name, suffix) {
  const val = getEnv(name, suffix);
  if (!val) throw new Error(`缺少环境变量：${name}${suffix || ""}`);
  return val;
}

function isAddress(addr) {
  try {
    return ethers.utils.isAddress(addr);
  } catch {
    return false;
  }
}

// 将 WITHDRAW_AMOUNT（USDC）转为 6 位最小单位
function parseAmountBaseUnits() {
  const amount = getEnv("WITHDRAW_AMOUNT", _NUM);
  if (!amount) return null;
  return ethers.utils.parseUnits(String(amount), 6).toString();
}

async function postWithdraw(payload) {
  const url = `${BRIDGE_BASE_URL}/withdraw`;
  const res = await axios.post(url, payload, {
    headers: { "Content-Type": "application/json" },
    timeout: 20000
  });
  return res.data;
}

async function executeSafeTransfer({
  safeAddress,
  ownerKey,
  tokenAddress,
  toAddress,
  amountBaseUnit
}) {
  const safeSdk = await Safe.init({
    provider: POLYGON_RPC,
    signer: ownerKey,
    safeAddress
  });

  // 编码 ERC20 transfer(to, amount)
  const tokenInterface = new ethers.utils.Interface([
    "function transfer(address to, uint256 amount) returns (bool)"
  ]);
  const data = tokenInterface.encodeFunctionData("transfer", [
    toAddress,
    amountBaseUnit
  ]);

  // 构造 Safe 交易
  const safeTx = await safeSdk.createTransaction({
    transactions: [
      {
        to: tokenAddress,
        value: "0",
        data,
        operation: OperationType.Call
      }
    ]
  });

  // 执行 Safe 交易（1/1 Safe）
  const executeTxResponse = await safeSdk.executeTransaction(safeTx);
  const receipt = await executeTxResponse.transactionResponse?.wait();
  return executeTxResponse.hash || receipt?.transactionHash;
}

async function main() {
  // 1) 读取必要环境变量
  const funder = requireEnv("FUNDER_ADDRESS", _NUM); // Safe 地址
  if (!isAddress(funder)) throw new Error(`FUNDER_ADDRESS${_NUM} 地址格式不正确`);

  const secret = requireEnv("SECRETKEY", _NUM); // EOA 私钥
  const recipientEnv = getEnv("RECIPIENT_ADDR", _NUM);
  const recipientAddr =
    !recipientEnv || recipientEnv === "0"
      ? new Wallet(secret).address
      : recipientEnv;

  if (!isAddress(recipientAddr)) throw new Error(`recipientAddr 地址格式不正确`);

  const amountBaseUnit = parseAmountBaseUnits();
  if (!amountBaseUnit) {
    throw new Error("缺少提现金额：请设置 WITHDRAW_AMOUNT（USDC 人类金额）");
  }

  // 2) 生成桥地址（官方 /withdraw）
  const withdrawPayload = {
    address: funder,
    toChainId: TO_CHAIN_ID,
    toTokenAddress: TO_TOKEN_ADDRESS,
    recipientAddr
  };
  console.log(`请求 /withdraw: address=${funder} recipient=${recipientAddr}`);
  const data = await postWithdraw(withdrawPayload);
  const bridgeAddr = data?.address?.evm;
  const note = data?.note || "";
  console.log(`桥地址(evm): ${bridgeAddr || "N/A"}`);
  if (note) console.log(`note: ${note}`);

  if (!bridgeAddr || !isAddress(bridgeAddr)) {
    throw new Error("桥地址无效，无法执行 Safe 转账");
  }

  // 3) Safe 转账 USDC.e 到桥地址（触发提现）
  console.log(`开始 Safe 转账 USDC.e -> 桥地址 ${bridgeAddr}`);
  const txHash = await executeSafeTransfer({
    safeAddress: funder,
    ownerKey: secret,
    tokenAddress: FROM_TOKEN_ADDRESS,
    toAddress: bridgeAddr,
    amountBaseUnit
  });
  console.log(`✅ Safe 转账已提交: ${txHash || "unknown"}`);
}

main().catch(err => {
  console.error("❌ 执行失败:", err.message || err);
  process.exit(1);
});
