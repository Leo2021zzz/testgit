# Polymarket 提现脚本说明（polymarket_withdraw.js）

**用途**  
从 Polymarket 的 Safe(proxy) 钱包发起提现，最终到账你的 EOA。

**核心流程**  
1. 调用官方 `POST /withdraw` 生成“桥地址”。  
2. Safe 从自身余额里转出 USDC.e 到桥地址。  
3. 桥服务将资金打到你的 EOA。


**必需环境变量**  
- `SECRETKEY`：EOA 私钥  
- `FUNDER_ADDRESS`：Polymarket Safe(proxy) 地址  
- `WITHDRAW_AMOUNT`：提现金额（例如 `5.25`）

**可选环境变量**  
- `RECIPIENT_ADDR`：提现收款地址  
  - 空或 `"0"`：自动使用 `SECRETKEY` 推导的 EOA 地址 
  - 非空：使用该地址

**固定参数（默认）**  
- 收款的目标链：Polygon（`137`）  
- 默认从 Safe（Polygon/USDC.e）提现到你的 EOA（Polygon/USDC.e）

**参数说明**  
脚本支持 `_NUM` 后缀参数：  
例如 `_1` 会读取 `SECRETKEY_1`、`FUNDER_ADDRESS_1`、`WITHDRAW_AMOUNT_1`、`RECIPIENT_ADDR_1`。

