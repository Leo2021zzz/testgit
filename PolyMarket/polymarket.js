// 版本改动
// 已有持仓，不再买入第二次
// 统计你的钱包跟随每个被监控的钱包，分别下了几笔订单，每笔多少钱，是什么市场
// fix bug: 日志显示不准确，跟单金额显示错误，显示跟单的完整钱包地址
// fix bug: 跟单金额显示错误; 日志中区分成功和失败的跟单记录
// fix bug: 失败的跟单记录不显示
// fix bug: 1. 跟单记录正确显示自己的钱包是否下单； 2. 过滤超过24小时的交易  3. 日志显示两个时间：聪明钱包下单时间，和记录该笔交易的时间
// fix bug: 执行完跟单，进行余额验证，余额有变动，跟单成功，余额未变动，重试5次后还是不成功则跳过交易
// fix bug: 每次提交订单后，虽然订单成功了，但余额还没更新，代码以为失败了，继续重试，又提交了新订单。 解决方案：延长等待（7秒） + 实时查询持仓验证
// update: 聪明钱包自动分行，不用;分隔
// fix bug：重复下单是否是购买还是售出， 售出需要继续跟单操作  // 只要有售出 则将全部售出,不按比例
// update: 更新传入参数 获取不同的数据   例如   task poly.js _1  则使用  _1组的数据 
// update: 新增聪明钱包最小下单金额跟随 默认100    环境变量 添加例如： MIN_FOLLOW_AMOUNT  值 500   低于500的不跟随下注
// update: 新增 检测到跟单钱包有 buy 另外一个 assets ，将这个市场下的 全部资产售出
// fix bug：修复重复下单
// update: 每次处理BUY交易前，会显示 "验证聪明钱包在该市场的持仓..."。如果检测到套利（≥持有2个方向），会显示 "聪明钱包套利，清仓退出";如果持有反方向，会显示 "我持有反方向，卖出规避风险！"
// update: 日志中会正确显示 sell 原因：跟随聪明钱包卖出；和聪明钱包持有相反方向；聪明钱包在套利
// update：领取奖金间隔24小时，避免 api 限额和日志爆炸
// update: Buy 类型下单，不再重试5次；3秒后检查状态，如果持仓和余额未变化，则输出结果变更为“状态未确认、手动查询”
// fix: 卖出经常不成功，添加重试机制（重试5次，间隔1秒。 最后统一接收结果）
// update: 当程序运行时（配置定时启动） 1. 限制买入次数  2. 仓位清仓后，程序关闭  3. 手动设置程序每日关闭时间
// fix：状态未确定的单子，会最多循环扫描10次。 如果已成功，则状态会更新（记录买入成功的次数）；10次后还扫描不到该仓位，则判定为失败
// update：买入时用三种方式查询是否成功：余额是否变化、仓位是否新增、Order ID 状态（新增）
// fix : 买入时只用 order id 查询。 修复一些日志显示问题
// update: 启用心跳日志。 
// fix  领取时部分领取失败  、二元市场 正常，多元市场结果 未知
// fix: 跟随卖出时，会先检查是否有该持仓。 没有持仓直接跳过，不在用空订单去访问 api ；优化下单失败的报错提示；买入2次并清仓后，程序现在会正确关闭； 修复买入时却提示余额不足的小概率事件，预留总资金的 3% 作为安全边际

//获取传入的参数
const args = process.argv.slice(2); // 跳过前两个固定参数
console.log('使用参数:', args[0]);
var _NUM = ""
if (args[0]) { _NUM = args[0] }


import { ClobClient, OrderType, AssetType } from "@polymarket/clob-client";
import { BuilderConfig } from "@polymarket/builder-signing-sdk";
import { RelayClient, RelayerTxType } from "@polymarket/builder-relayer-client";
import { Wallet, providers,ethers } from "ethers";
import axios from "axios";
import moment from 'moment';
import { encodeFunctionData } from "viem";

// ==================== 全局统计变量 ====================
const globalStats = {
  walletTrades: {},      // 成功的跟单记录
  walletFailedTrades: {},// 失败的跟单记录
  totalBuyCount: 0,       // 总成功买入次数计数器
  buyPositions: new Set(), // 记录买入的 conditionId
  pendingVerification: []  // 待验证的未确定单子
};

// ==================== 配置部分 ====================

// 环境变量
const SECRETKEY = getSecretKey(`SECRETKEY${_NUM}`);  // 私钥
const FUNDER_ADDRESS = getSecretKey(`FUNDER_ADDRESS${_NUM}`);  // polymarket地址
const SMART_WALLET = getSecretKey(`SMART_WALLET${_NUM}`);    // 聪明钱包 格式  0x....;0x....;0x....
const FOLLOW_VALUE = parseFloat(getSecretKey(`FOLLOW_VALUE${_NUM}`) || 0.1);   // 跟单比例
const CYCLE_INTERVAL_MS = getSecretKey(`CYCLE_INTERVAL_MS${_NUM}`) || 120000; // 2分钟循环间隔

// https://polymarket.com/settings?tab=builder 中添加获取
const POLY_BUILDER_API_KEY = getSecretKey(`POLY_BUILDER_API_KEY${_NUM}`);
const POLY_BUILDER_SECRET = getSecretKey(`POLY_BUILDER_SECRET${_NUM}`);
const POLY_BUILDER_PASSPHRASE = getSecretKey(`POLY_BUILDER_PASSPHRASE${_NUM}`);

const MIN_ORDER_AMOUNT = getSecretKey(`MIN_ORDER_AMOUNT${_NUM}`) || 1; // 最小订单金额
const MAX_ORDER_AMOUNT = getSecretKey(`MAX_ORDER_AMOUNT${_NUM}`) || 2; // 最大订单金额
const MIN_FOLLOW_AMOUNT = getSecretKey(`MIN_FOLLOW_AMOUNT${_NUM}`) || 100; // 聪明钱包最小跟随下注单金额

const MAX_BUY_COUNT = 2; // 最大买入次数限制，达到后只能卖出和领取
// 设置程序自动关闭时间
const AUTO_CLOSE_HOUR = 23;   // 自动关闭时间：小时（北京时间）
const AUTO_CLOSE_MINUTE = 59; // 自动关闭时间：分钟（北京时间）
// 心跳日志
const HEARTBEAT_INTERVAL = 10; // 10次循环，心跳一次。 心跳：已运行 6 轮 | 成功 0 | BUY 0/2


// 配置常量
const HOST = "https://clob.polymarket.com";
const Relayer_HOST = "https://relayer-v2.polymarket.com/";
const CHAIN_ID = 137;
const SIGNATURE_TYPE = 2;
const MAX_RETRIES = 3;
const SCAN_DELAY_MS = 2000;

const MIN_AVAILABLE_BALANCE = 1; // 最小可用余额，低于此值不执行买入

// 合约地址
const CTF_ADDRESS = "0x4d97dcd97ec945f40cf65f87097ace5ea0476045";
const USDCe_ADDRESS = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174";
const NEG_RISK_ADAPTER = "0xd91E80cF2E7be2e162c6513ceD06f1dD0dA35296"

// ==================== 工具函数 ====================

//获取变量
function getSecretKey(envVarName) {
  return process.env[envVarName];
}

/**
 * 延迟函数
 * @param {number} ms - 延迟毫秒数
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * HTTP GET请求封装（带重试）
 * @param {string} url - 请求URL
 * @param {Object} config - 请求配置
 * @param {number} retryCount - 当前重试次数
 */
async function httpGet(url, config = {}, retryCount = 0) {
  try {
    const response = await axios.get(url, config);
    return response.data;
  } catch (error) {
    if (retryCount < MAX_RETRIES) {
      console.log(`请求失败，第 ${retryCount + 1} 次重试...`);
      await delay(1000 * (retryCount + 1));
      return httpGet(url, config, retryCount + 1);
    }
    console.error(`请求失败，URL: ${url}, 错误: ${error.message}`);
    return null;
  }
}

/**
 * 验证环境变量
 */
function validateEnvironmentVariables() {
  if (!SECRETKEY) {
    console.error('错误：未设置私钥，请在环境变量中添加 SECRETKEY' + _NUM);
    process.exit(1);
  }

  if (!FUNDER_ADDRESS) {
    console.error('错误：未设置代理地址，请在环境变量中添加 FUNDER_ADDRESS' + _NUM);
    process.exit(1);
  }

  if (!SMART_WALLET) {
    console.error('错误：未设置聪明钱包地址，请在环境变量中添加 SMART_WALLET' + _NUM);
    process.exit(1);
  }

  const SMART_ADDRESSES = SMART_WALLET.split("\n").filter(addr => addr.trim());
  if (SMART_ADDRESSES.length === 0) {
    console.error('错误：未找到有效的钱包地址');
    process.exit(1);
  }

  return SMART_ADDRESSES;
}

/**
 * 初始化签名者
 */
function initializeSigner() {
  const provider = new providers.JsonRpcProvider("polygon-rpc.com");
  return new Wallet(SECRETKEY).connect(provider);
}

// ==================== 交易相关函数 ====================

/**
 * 获取最近交易
 * @param {string} walletAddress - 钱包地址
 * @param {number} minutes - 最近几分钟的交易
 */
async function getRecentTrades(walletAddress, minutes = 120) {
  try {
    const url = `https://data-api.polymarket.com/activity?user=${walletAddress}&limit=25&offset=0`;
    const trades = await httpGet(url);

    if (!trades || trades.length === 0) {
      return [];
    }

    // 筛选最近N分钟的交易
    const currentTime = Math.floor(Date.now() / 1000);
    const timeThreshold = currentTime - minutes * 60;

    return trades.filter(trade => trade.timestamp >= timeThreshold);
  } catch (error) {
    console.error(`获取钱包 ${walletAddress} 交易失败:`, error.message);
    return [];
  }
}

/**
 * 获取可用余额
 * @param {Object} client - CLOB客户端
 */
async function getAvailableBalance(client) {
  try {
    const balance = await client.getBalanceAllowance({
      asset_type: AssetType.COLLATERAL
    });
    return balance.balance / 1000000 || 0;
  } catch (error) {
    console.error(`获取余额失败:`, error.message);
    return 0;
  }
}

/**
 * 获取当前账户已持有的 conditionId 集合
 * 用于避免重复跟单
 */
async function getMyHoldingConditionSet() {
  const positions = await httpGet(
    `https://data-api.polymarket.com/positions?user=${FUNDER_ADDRESS}`
  );

  if (!Array.isArray(positions)) return new Set();

  return new Set(
    positions
      .filter(p => Number(p.size) > 0)
      .map(p => p.conditionId)
  );
}


/**
 * 执行跟单交易、新增执行卖出操作（重试机制）
 * @param {Object} client - CLOB客户端
 * @param {Object} trade - 交易信息
 * @param {Object} market - 市场信息
 * @param {number} availableBalance - 可用余额
 */
async function executeSellWithRetries(client, trade, market, availableBalance) {
  const SELL_RETRY_COUNT = 5; // 卖出重试次数，修改这里即可

  console.log(`🔄 开始卖出操作（${SELL_RETRY_COUNT}次重试机制）...`);

  const promises = [];

  // 连续发起N次卖出请求，每次间隔1秒
  for (let i = 0; i < SELL_RETRY_COUNT; i++) {
    if (i > 0) {
      await delay(1000); // 等待1秒
    }
    console.log(`  📤 发起第 ${i + 1} 次卖出请求...`);
    const promise = executeFollowTrade(client, trade, market, availableBalance);
    promises.push(promise);
  }

  // 等待所有请求返回
  console.log(`⏳ 等待所有卖出请求返回结果...`);
  const results = await Promise.all(promises);

  // 打印所有结果
  console.log(`\n📊 卖出结果汇总：`);
  let successCount = 0;
  results.forEach((result, index) => {
    if (result && result.orderID) {
      console.log(`  ✅ 第 ${index + 1} 次: 成功 (OrderID: ${result.orderID})`);
      successCount++;
    } else {
      // 简化失败原因显示
      let reason = result?.reason || '未知原因';
      if (reason.includes('not enough balance')) {
        reason = '余额不足';
      } else if (reason.includes('invalid amounts') || reason.includes('must be higher than 0')) {
        reason = '金额无效';
      }
      console.log(`  ❌ 第 ${index + 1} 次: 失败 (${reason})`);
    }
  });

  console.log(`📈 成功率: ${successCount}/${SELL_RETRY_COUNT}\n`);

  // 只要有一次成功就返回成功结果
  const successResult = results.find(r => r && r.orderID);
  return successResult || results[0];
}

async function executeFollowTrade(client, trade, market, availableBalance) {
  try {
    const { asset, side, usdcSize, size } = trade;
    let amount = 0;

    if (!side) {
      console.error("领取不执行跟单，跳过");
      return { success: false, reason: "领取交易，不跟单" };
    }
    // 计算跟单金额
    if (side === "BUY") {

      if (usdcSize < MIN_FOLLOW_AMOUNT) {  //聪明钱包最小跟随金额
        return { success: false, reason: `聪明钱包下单金额太小$${usdcSize}` };
      }

      if (FOLLOW_VALUE == 0) {   //设置跟单随机
        amount = parseFloat((Math.random() * (MAX_ORDER_AMOUNT - MIN_ORDER_AMOUNT) + parseFloat(MIN_ORDER_AMOUNT)).toFixed(3));
      } else {   //按固定比例跟
        amount = parseFloat((usdcSize * FOLLOW_VALUE).toFixed(3));
      }
      console.log(`计划买入: $${amount}`);


      // 检查可用余额是否足够
      if (availableBalance < MIN_AVAILABLE_BALANCE) {
        console.log(`❌ 可用余额不足: $${availableBalance.toFixed(2)} < $${MIN_AVAILABLE_BALANCE}，跳过交易`);
        return { success: false, reason: `余额不足($${availableBalance.toFixed(2)})` };

      }

      // 检查最小金额
      if (amount < MIN_ORDER_AMOUNT) {
        console.log(`跟单金额小于最小订单金额($${MIN_ORDER_AMOUNT})，跳过`);
        return { success: false, reason: `金额太小($${amount.toFixed(2)} < $${MIN_ORDER_AMOUNT})` };

      }

      // 检查最大金额
      if (amount > MAX_ORDER_AMOUNT) {
        amount = MAX_ORDER_AMOUNT;
        console.log(`跟单金额超过上限，调整为: $${amount}`);
      }

      // 确保金额不超过可用余额，预留3%作为安全边距
      const safeBalance = availableBalance * 0.97; // 只使用97%的可用余额
      if (amount > safeBalance) {
        amount = safeBalance;
        console.log(`跟单金额调整为可用余额的97%: $${amount.toFixed(2)}`);
      }


    } else {
      //获取可卖出的 数量仓位 
      const sell_balance = await client.getBalanceAllowance({
        asset_type: AssetType.CONDITIONAL,
        token_id: asset
      });

      if (sell_balance.balance > 0) {
        amount = Math.floor((sell_balance.balance / 1000000) * 100) / 100;   // 全部卖出持有的
      } else {
        console.log(`没有可卖出的资产`);
        return { success: false, reason: "没有可卖出的资产" };
      }
      // amount = parseFloat((size * FOLLOW_VALUE).toFixed(3));
      console.log(`计划卖出: ${amount} 股`);
    }

    console.log(`执行交易: $${amount}`);

    // 市价单 - FOK (全部成交或取消)  FAK 允许部分成交
    const response = await client.createAndPostMarketOrder(
      {
        tokenID: asset,
        amount: amount,
        side: side,
        price: side === "BUY" ? 0.99 : 0.01,  // BUY最高0.99，SELL最低0.01
        // price: 0.99,
      },
      {
        tickSize: market.minimum_tick_size || "0.01",
        negRisk: market.neg_risk || false
      },
      OrderType.FOK
    );

    // 返回结果时带上实际金额
    if (response && response.orderID) {
      response.actualAmount = amount;
      response.actualSide = side;
    }

    return response;
  } catch (error) {
    // 隐藏常见的错误信息，只在非预期错误时显示
    const errorMsg = error.message || '';
    const isExpectedError = 
      errorMsg.includes('not enough balance') || 
      errorMsg.includes('invalid amounts') ||
      errorMsg.includes('maker and taker amount must be higher than 0');
    
    if (!isExpectedError) {
      console.error(`跟单执行失败:`, error.message);
    }
    return { success: false, reason: `交易执行失败: ${error.message}` };
  }
}

/**
 * 处理单个钱包
 * @param {Object} client - CLOB客户端
 * @param {string} walletAddress - 钱包地址
 * @param {number} cycleNumber - 当前循环次数
 */

// 验证待确定的单子
async function verifyPendingTrades(client, currentCycle) {
  if (!globalStats.pendingVerification || globalStats.pendingVerification.length === 0) {
    return;
  }

  console.log(`\n🔍 开始验证 ${globalStats.pendingVerification.length} 笔待确定单子...`);

  for (let i = 0; i < globalStats.pendingVerification.length; i++) {
    const record = globalStats.pendingVerification[i];
    const cyclesPassed = currentCycle - record.cycleAdded;

    // ===== 规则一：超过 10 轮，直接放弃 =====
    if (cyclesPassed >= 10) {
      console.log(
        `❌ pending 超时（${cyclesPassed} 轮），判定失败: ${record.conditionId?.slice(0, 8)}...`
      );

      const failedList = globalStats.walletFailedTrades[FUNDER_ADDRESS];
      if (Array.isArray(failedList)) {
        const target = failedList.find(r => r.orderID === record.orderID);
        if (target) {
          target.reason = `超过 ${cyclesPassed} 轮未确认，判定失败`;
        }
      }

      globalStats.pendingVerification.splice(i, 1);
      i--;
      continue;
    }

    // ===== 只查询一次订单状态 =====
    let orderStatus;
    try {
      orderStatus = await client.getOrder(record.orderID);
    } catch (error) {
      console.log(`⚠️ 查询 pending 订单状态失败: ${error.message}`);
      continue; // 本轮查不到，留到下一轮
    }

    // ===== 规则二：订单已取消 / 过期 → 失败 =====
    if (orderStatus?.status === 'CANCELLED' || orderStatus?.status === 'EXPIRED') {
      console.log(
        `❌ 订单 ${orderStatus.status}，判定失败: ${record.conditionId?.slice(0, 8)}...`
      );

      const failedList = globalStats.walletFailedTrades[FUNDER_ADDRESS];
      if (Array.isArray(failedList)) {
        const target = failedList.find(r => r.orderID === record.orderID);
        if (target) {
          target.reason = `订单状态 ${orderStatus.status}`;
        }
      }

      globalStats.pendingVerification.splice(i, 1);
      i--;
      continue;
    }

    // ===== 规则三：订单 MATCHED → 成功 =====
    if (orderStatus?.status === 'MATCHED') {
      console.log(
        `✅ pending 单子确认成功（MATCHED）: ${record.conditionId?.slice(0, 8)}...`
      );

      // 从失败列表中移除
      const failedList = globalStats.walletFailedTrades[FUNDER_ADDRESS];
      if (Array.isArray(failedList)) {
        const idx = failedList.findIndex(r => r.orderID === record.orderID);
        if (idx !== -1) {
          failedList.splice(idx, 1);
        }
      }

      // 加入成功列表
      if (!globalStats.walletTrades[FUNDER_ADDRESS]) {
        globalStats.walletTrades[FUNDER_ADDRESS] = [];
      }
      globalStats.walletTrades[FUNDER_ADDRESS].push({
        tradeTime: record.tradeTime,
        followTime: moment().format('YYYY-MM-DD HH:mm:ss'),
        market: record.market,
        amount: record.amount,
        side: 'BUY（pending 转正）',
        followedWallet: record.followedWallet
      });
      // 成功后记录 BUY 次数
      globalStats.totalBuyCount++;
      globalStats.buyPositions.add(record.conditionId);


      globalStats.pendingVerification.splice(i, 1);
      i--;
      continue;
    }

    // ===== 走到这里：订单仍然是 PENDING，什么都不做，等下一轮 =====
  }
}


// async function processWallet(client, walletAddress, cycleNumber) {
//   console.log(`\n[循环 ${cycleNumber}] 扫描钱包: ${walletAddress}`);
//    const cycleCount = cycleNumber; 
//   // const myHoldingConditions = await getMyHoldingConditionSet();

//   // 获取最近交易
//   const tradeMinutes = CYCLE_INTERVAL_MS / 1000 / 60;
//   const trades = await getRecentTrades(walletAddress, tradeMinutes);
//   console.log(`发现最近${tradeMinutes}分钟内的交易: ${trades.length} 笔`);
async function processWallet(client, walletAddress, cycleNumber) {
  const cycleCount = cycleNumber;
  // const myHoldingConditions = await getMyHoldingConditionSet();

  // 获取最近交易
  const tradeMinutes = CYCLE_INTERVAL_MS / 1000 / 60;
  const trades = await getRecentTrades(walletAddress, tradeMinutes);

  // ⭐ Step 3：只有发现交易才打印扫描日志
  if (trades.length > 0) {
    console.log(`\n[循环 ${cycleNumber}] 扫描钱包: ${walletAddress}`);
    console.log(`发现最近${tradeMinutes}分钟内的交易: ${trades.length} 笔`);
  }

  if (trades.length === 0) {
    return { wallet: walletAddress, processed: 0, success: 0 };
  }

  // 获取可用余额
  const availableBalance = await getAvailableBalance(client);
  console.log(`当前可用余额: $${availableBalance.toFixed(2)}`);

  // === 新增：获取自己已有的持仓，用于过滤重复跟单 ===
  const myPositions = await httpGet(
    `https://data-api.polymarket.com/positions?user=${FUNDER_ADDRESS}`
  );

  // 构建已持仓 conditionId 集合（只判断是否已有仓位）
  // const myPositionSet = new Set(
  //   (myPositions || [])
  //     .filter(p => Number(p.size) > 0)
  //     .map(p => p.conditionId)
  // );

  const myPositionSet = new Map(
    (myPositions || [])
      .filter(p => Number(p.size) > 0)
      .map(p => [p.conditionId, p.asset])
  );

  console.log(myPositionSet);

  if (availableBalance < MIN_AVAILABLE_BALANCE) {
    console.log(`⚠️ 可用余额不足$${MIN_AVAILABLE_BALANCE}，跳过该钱包的所有交易`);
    return { wallet: walletAddress, processed: trades.length, success: 0 };
  }

  console.log("开始跟单操作...");
  let successCount = 0;
  let currentBalance = availableBalance;

  // 处理每笔交易
  for (let i = 0; i < trades.length; i++) {
    const trade = trades[i];
    const trade_asset = trade.asset  // 成交前的实际资产
    try {

      // 检查是否达到买入次数限制，检查聪明钱包是否套利
      if (trade.side === "BUY") {
        // 检查是否已达到最大买入次数
        if (globalStats.totalBuyCount >= MAX_BUY_COUNT) {
          console.log(`🚫 已达到最大买入次数限制(${MAX_BUY_COUNT}次)，跳过买入操作`);

          if (!globalStats.walletFailedTrades[FUNDER_ADDRESS]) {
            globalStats.walletFailedTrades[FUNDER_ADDRESS] = [];
          }
          globalStats.walletFailedTrades[FUNDER_ADDRESS].push({
            tradeTime: moment(trade.timestamp * 1000).format('YYYY-MM-DD HH:mm:ss'),
            followTime: moment().format('YYYY-MM-DD HH:mm:ss'),
            market: market?.question || trade.market || '未知市场',
            side: 'BUY',
            reason: `已达到买入次数上限(${MAX_BUY_COUNT}次)`,
            followedWallet: walletAddress
          });

          continue;
        }
        // 买入前检查聪明钱包是否套利
        const smartWalletPositions = await httpGet(
          `https://data-api.polymarket.com/positions?user=${walletAddress}`
        );

        if (Array.isArray(smartWalletPositions)) {
          const marketPositions = smartWalletPositions.filter(
            p => p.conditionId === trade.conditionId && Number(p.size) > 0
          );

          // 如果聪明钱包持有2个方向（套利）且我有持仓，清仓；我没持仓，则跳过不跟
          // 我新增卖出重试机制
          if (marketPositions.length >= 2) {
            if (myPositionSet.has(trade.conditionId)) {
              // 我有持仓，清仓
              console.log(`⚠️ 聪明钱包套利（持有${marketPositions.length}个方向），清仓退出`);

              const market = await client.getMarket(trade.conditionId);
              const sellTrade = {
                asset: myPositionSet.get(trade.conditionId),
                side: "SELL",
                conditionId: trade.conditionId,
                size: 999999
              };

              // 使用新的卖出重试机制
              const sellResult = await executeSellWithRetries(client, sellTrade, market, currentBalance);

              // 等待7秒后检查结果
              await delay(7000);
              const newBalance = await getAvailableBalance(client);
              const balanceChanged = Math.abs(newBalance - currentBalance) > 0.01;

              // 判断是否成功
              if (sellResult && sellResult.orderID && balanceChanged) {
                console.log(`✅ 套利清仓成功！余额: $${currentBalance.toFixed(2)} → $${newBalance.toFixed(2)}`);
                myPositionSet.delete(trade.conditionId);
                currentBalance = newBalance;

                if (!globalStats.walletTrades[FUNDER_ADDRESS]) {
                  globalStats.walletTrades[FUNDER_ADDRESS] = [];
                }
                globalStats.walletTrades[FUNDER_ADDRESS].push({
                  tradeTime: moment(trade.timestamp * 1000).format('YYYY-MM-DD HH:mm:ss'),
                  followTime: moment().format('YYYY-MM-DD HH:mm:ss'),
                  market: market.question || trade.market || market.description || '未知市场',
                  amount: sellResult.actualAmount || 0,
                  side: 'SELL (套利清仓)',
                  followedWallet: walletAddress
                });
                successCount++;
              } else {
                console.log(`❌ 套利清仓失败`);

                if (!globalStats.walletFailedTrades[FUNDER_ADDRESS]) {
                  globalStats.walletFailedTrades[FUNDER_ADDRESS] = [];
                }
                globalStats.walletFailedTrades[FUNDER_ADDRESS].push({
                  tradeTime: moment(trade.timestamp * 1000).format('YYYY-MM-DD HH:mm:ss'),
                  followTime: moment().format('YYYY-MM-DD HH:mm:ss'),
                  market: market.question || trade.market || market.description || '未知市场',
                  side: 'SELL (套利清仓)',
                  reason: sellResult?.reason || '卖出失败',
                  followedWallet: walletAddress
                });
              }

              continue;
            }
            else {
              // 我没持仓，跳过不跟
              console.log(`⚠️ 聪明钱包套利（持有${marketPositions.length}个方向），跳过不跟`);
              continue;
            }
          }
        }

        await delay(300);
      }
      // ⭐ 新增：忽略超过24小时的交易
      const tradeTime = trade.timestamp * 1000;
      const currentTime = Date.now();
      const hoursSinceTradeMS = currentTime - tradeTime;
      const hoursSinceTrade = hoursSinceTradeMS / 1000 / 60 / 60;

      if (hoursSinceTrade > 24) {
        const tradeDate = new Date(tradeTime).toLocaleString();
        console.log(`⏰ 跳过超过24小时的交易: ${tradeDate} | ${trade.market?.substring(0, 30) || '未知市场'}`);
        continue;
      }

      // 获取市场信息
      const market = await client.getMarket(trade.conditionId);

      if (market.closed) {
        console.log("该笔下注市场已经结束");

        // 记录失败交易
        if (!globalStats.walletFailedTrades[FUNDER_ADDRESS]) {
          globalStats.walletFailedTrades[FUNDER_ADDRESS] = [];
        }

        globalStats.walletFailedTrades[FUNDER_ADDRESS].push({
          tradeTime: moment(trade.timestamp * 1000).format('YYYY-MM-DD HH:mm:ss'),
          followTime: moment().format('YYYY-MM-DD HH:mm:ss'),
          market: market.question || trade.market || market.description || '未知市场',
          side: trade.side || 'UNKNOWN',
          reason: '市场已结束',
          followedWallet: walletAddress
        });

        continue;
      }


      // 检查是否已有持仓
      if (trade.side == "BUY" && myPositionSet.has(trade.conditionId)) {
        if (myPositionSet.get(trade.conditionId) == trade.asset) {
          // 同方向，跳过
          console.log(`⭐️ 已有持仓（同方向），跳过 market: ${trade.conditionId.substring(0, 8)}...`);

          if (!globalStats.walletFailedTrades[FUNDER_ADDRESS]) {
            globalStats.walletFailedTrades[FUNDER_ADDRESS] = [];
          }
          globalStats.walletFailedTrades[FUNDER_ADDRESS].push({
            tradeTime: moment(trade.timestamp * 1000).format('YYYY-MM-DD HH:mm:ss'),
            followTime: moment().format('YYYY-MM-DD HH:mm:ss'),
            market: market.question || trade.market || market.description || '未知市场',
            side: trade.side || 'UNKNOWN',
            reason: '已有持仓（同方向）',
            followedWallet: walletAddress
          });

          continue;

        } else {
          // 反方向，卖出规避风险
          console.log(`⚠️ 我持有反方向，卖出规避风险！`);
          console.log(`   聪明钱包持有: ${trade.asset.substring(0, 20)}...`);
          console.log(`   我持有: ${myPositionSet.get(trade.conditionId).substring(0, 20)}...`);
          console.log(`💰 执行卖出操作...`);

          const sellTrade = {
            asset: myPositionSet.get(trade.conditionId),
            side: "SELL",
            conditionId: trade.conditionId,
            size: 999999
          };

          // 使用新的卖出重试机制
          const sellResult = await executeSellWithRetries(client, sellTrade, market, currentBalance);

          // 等待7秒后检查结果
          await delay(7000);
          const newBalance = await getAvailableBalance(client);
          const balanceChanged = Math.abs(newBalance - currentBalance) > 0.01;

          // 判断是否成功
          if (sellResult && sellResult.orderID && balanceChanged) {
            console.log(`✅ 反向清仓成功！余额: $${currentBalance.toFixed(2)} → $${newBalance.toFixed(2)}`);
            myPositionSet.delete(trade.conditionId);
            currentBalance = newBalance;

            if (!globalStats.walletTrades[FUNDER_ADDRESS]) {
              globalStats.walletTrades[FUNDER_ADDRESS] = [];
            }
            globalStats.walletTrades[FUNDER_ADDRESS].push({
              tradeTime: moment(trade.timestamp * 1000).format('YYYY-MM-DD HH:mm:ss'),
              followTime: moment().format('YYYY-MM-DD HH:mm:ss'),
              market: market.question || trade.market || market.description || '未知市场',
              amount: sellResult.actualAmount || 0,
              side: 'SELL (反向清仓)',
              followedWallet: walletAddress
            });
            successCount++;
          } else {
            console.log(`❌ 反向清仓失败`);

            if (!globalStats.walletFailedTrades[FUNDER_ADDRESS]) {
              globalStats.walletFailedTrades[FUNDER_ADDRESS] = [];
            }
            globalStats.walletFailedTrades[FUNDER_ADDRESS].push({
              tradeTime: moment(trade.timestamp * 1000).format('YYYY-MM-DD HH:mm:ss'),
              followTime: moment().format('YYYY-MM-DD HH:mm:ss'),
              market: market.question || trade.market || market.description || '未知市场',
              side: 'SELL (反向清仓)',
              reason: sellResult?.reason || '卖出失败',
              followedWallet: walletAddress
            });
          }

          continue;
        }
      }


      // ===== 执行跟单 =====
      let orderSuccess = false;
      let finalResult = null;
      const MAX_RETRIES = 1;// 最大买入次数（1为不重试）

      // 如果是卖出操作，使用新的重试机制
      if (trade.side === "SELL") {
        // 检查是否还有持仓，避免重复卖出
        const sellBalance = await client.getBalanceAllowance({
          asset_type: AssetType.CONDITIONAL,
          token_id: trade.asset
        });
        
        if (sellBalance.balance <= 0) {
          console.log(`⏭️ 跳过卖出：该资产已无持仓 (${trade.asset.substring(0, 20)}...)`);
          continue; // 跳过这笔交易，处理下一笔
        }
        
        console.log(`💰 执行跟随卖出操作...`);
        trade.sellType = "跟随卖出";  // 标记跟随卖出 

        const sellResult = await executeSellWithRetries(client, trade, market, currentBalance);

        // 等待7秒后检查结果
        await delay(7000);
        const newBalance = await getAvailableBalance(client);
        const balanceChanged = Math.abs(newBalance - currentBalance) > 0.01;

        // 只要有orderID就认为是成功的（5次中有1次成功）
        if (sellResult && sellResult.orderID) {
          if (balanceChanged) {
            console.log(`✅ 跟随卖出成功！余额: $${currentBalance.toFixed(2)} → $${newBalance.toFixed(2)}`);
          } else {
            console.log(`✅ 跟随卖出成功！(余额未立即变化，可能延迟更新)`);
          }
          orderSuccess = true;
          finalResult = sellResult;
          currentBalance = newBalance;
          myPositionSet.delete(trade.conditionId);
        } else {
          console.log(`❌ 跟随卖出失败`);
          finalResult = sellResult || { success: false, reason: '卖出失败' };
        }

      } else {

        for (let retry = 0; retry < MAX_RETRIES; retry++) {
          if (retry > 0) {
            console.log(`🔄 第 ${retry} 次重试...`);
            await delay(1000);
          }

          const result = await executeFollowTrade(client, trade, market, currentBalance);

          // ===== 补丁：金额太小，立刻跳过（一定要在最前面）=====
          if (
            result?.success === false &&
            result?.reason &&
            result.reason.includes('聪明钱包下单金额太小')
          ) {
            console.log(`⏭️ 跳过该交易（原因：${result.reason}）`);

            if (!globalStats.walletFailedTrades[FUNDER_ADDRESS]) {
              globalStats.walletFailedTrades[FUNDER_ADDRESS] = [];
            }

            globalStats.walletFailedTrades[FUNDER_ADDRESS].push({
              tradeTime: moment(trade.timestamp * 1000).format('YYYY-MM-DD HH:mm:ss'),
              followTime: moment().format('YYYY-MM-DD HH:mm:ss'),
              market: market.question || trade.market || '未知市场',
              side: 'BUY',
              reason: result.reason,
              followedWallet: walletAddress,
              cycleAdded: cycleNumber
            });

            continue; // ⭐ 关键：直接处理下一笔 trade
          }
          // ===== 补丁结束 =====

          if (result && result.orderID) {
            console.log(`📝 获得 Order ID: ${result.orderID}`);

            console.log(`⏳ 等待 7 秒让交易确认...`);
            await delay(7000);

            const newBalance = await getAvailableBalance(client);
            console.log(`💰 余额检查: 之前 $${currentBalance.toFixed(2)}, 现在 $${newBalance.toFixed(2)}`);
            const balanceChanged = Math.abs(newBalance - currentBalance) > 0.01;

            let hasPosition = false;
            try {
              const currentPositions = await httpGet(
                `https://data-api.polymarket.com/positions?user=${FUNDER_ADDRESS}`
              );
              if (Array.isArray(currentPositions)) {
                hasPosition = currentPositions.some(
                  p => p.conditionId === trade.conditionId && Number(p.size) > 0
                );
                if (hasPosition) {
                  console.log(`✅ 检测到已有持仓，订单已成交`);
                }
              }
            } catch (error) {
              console.log(`⚠️  查询持仓失败: ${error.message}`);
            }

            // 新增：通过OrderID验证订单状态
            let orderMatched = false;
            try {
              const orderStatus = await client.getOrder(result.orderID);
              if (orderStatus && orderStatus.status === 'MATCHED') {
                console.log(`✅ 订单状态已确认: MATCHED`);
                orderMatched = true;
              } else if (orderStatus && orderStatus.status) {
                console.log(`⚠️ 订单状态: ${orderStatus.status}`);
              }
            } catch (error) {
              console.log(`⚠️ 查询订单状态失败: ${error.message}`);
            }
            // ✅ 只要 MATCHED，立刻成功（最高优先级）
            if (orderMatched) {
              console.log(`✅ 跟单成功（以订单状态 MATCHED 为准）`);
              orderSuccess = true;
              finalResult = result;
              currentBalance = newBalance;
              break;
            }

            // ⏳ 未 MATCHED：不在这里判失败，进入 pending
            console.log(`⏳ 订单未在 7 秒内确认，进入 pending 验证`);

            const pendingRecord = {
              tradeTime: moment(trade.timestamp * 1000).format('YYYY-MM-DD HH:mm:ss'),
              followTime: moment().format('YYYY-MM-DD HH:mm:ss'),
              market: market.question || trade.market || '未知市场',
              side: trade.side || 'BUY',
              reason: '状态未确定，请手动查询',
              followedWallet: walletAddress,
              conditionId: trade.conditionId,
              asset: trade.asset,
              cycleAdded: cycleNumber,
              orderID: result.orderID,
              amount: result.actualAmount || 0
            };

            if (!globalStats.walletFailedTrades[FUNDER_ADDRESS]) {
              globalStats.walletFailedTrades[FUNDER_ADDRESS] = [];
            }
            // 等 verifyPendingTrades 最终判定
            // 成功 → 加入成功统计,失败 → 再写入 walletFailedTrades
            //globalStats.walletFailedTrades[FUNDER_ADDRESS].push(pendingRecord);

            globalStats.pendingVerification.push(pendingRecord);
            break;



          } else {
            finalResult = result
            console.log(`❌ 执行失败: ${result?.reason || '未知原因'}`);
            break;
          }
        }
      }

      // ===== 根据最终结果记录统计 =====
      if (orderSuccess && finalResult) {
        // 记录成功
        successCount++;
        myPositionSet.set(trade.conditionId, trade_asset);
        console.log(myPositionSet);
        if (!globalStats.walletTrades[FUNDER_ADDRESS]) {
          globalStats.walletTrades[FUNDER_ADDRESS] = [];
        }

        globalStats.walletTrades[FUNDER_ADDRESS].push({
          tradeTime: moment(trade.timestamp * 1000).format('YYYY-MM-DD HH:mm:ss'),
          followTime: moment().format('YYYY-MM-DD HH:mm:ss'),
          market: market.question || trade.market || market.description || '未知市场',
          amount: finalResult.actualAmount || 0,
          side: trade.sellType ? `SELL (${trade.sellType})` : (finalResult.actualSide || trade.side),
          followedWallet: walletAddress
        });

        // 如果是买入操作，增加买入计数并记录 conditionId
        if (finalResult.actualSide === 'BUY' && !trade.sellType) {
          globalStats.totalBuyCount++;
          globalStats.buyPositions.add(trade.conditionId);
          console.log(`📊 当前累计买入次数: ${globalStats.totalBuyCount}/${MAX_BUY_COUNT}`);
        }

        // 检查余额是否足够继续
        if (currentBalance < MIN_AVAILABLE_BALANCE) {
          console.log(`余额不足$${MIN_AVAILABLE_BALANCE},停止处理该钱包的后续交易`);
          break;
        }
      } else {
        // 记录失败
        if (!globalStats.walletFailedTrades[FUNDER_ADDRESS]) {
          globalStats.walletFailedTrades[FUNDER_ADDRESS] = [];
        }

        const failedRecord = {
          tradeTime: moment(trade.timestamp * 1000).format('YYYY-MM-DD HH:mm:ss'),
          followTime: moment().format('YYYY-MM-DD HH:mm:ss'),
          market: market.question || trade.market || '未知市场',
          side: trade.side || 'UNKNOWN',
          reason: finalResult?.reason || '执行失败',
          followedWallet: walletAddress,
          conditionId: trade.conditionId,
          asset: trade.asset,
          cycleAdded: cycleNumber,
          orderID: finalResult?.orderID || null,
          amount: finalResult?.actualAmount || 0
        };

        globalStats.walletFailedTrades[FUNDER_ADDRESS].push(failedRecord);



        // 只有“真的不确定”的单子才进 pending
        const shouldPending =
          failedRecord.orderID &&
          !orderSuccess &&
          failedRecord.reason === '状态未确定，请手动查询';

        if (shouldPending) {
          globalStats.pendingVerification.push(failedRecord);
          console.log(`⏳ 加入 pending 验证队列（conditionId: ${failedRecord.conditionId?.slice(0, 8)}...)`);
        }
      }


      // 交易间短暂延迟
      if (i < trades.length - 1) {
        await delay(100);
      }
    } catch (error) {
      console.error(`处理交易失败:`, error.message);
    }
  }

  return { wallet: walletAddress, processed: trades.length, success: successCount };
}

// ==================== 账户统计函数 ====================

/**
 * 创建领取交易
 * @param {Object} position - 持仓信息
 */
function createRedeemTransaction(position) {

  if (position.negativeRisk) {   // 负风险市场赎回
    console.error("负风险市场赎回");
    let amounts
    if (position.outcomeIndex == 0) {
      amounts = [ethers.parseUnits(position.size, 6), 0];
    } else {
      amounts = [0, ethers.parseUnits(position.size, 6)];
    }
    return {
      to: NEG_RISK_ADAPTER,
      data: encodeFunctionData({
        abi: [{
          "name": "redeemPositions",
          "type": "function",
          "inputs": [
            { "name": "conditionId", "type": "bytes32" },
            { "name": "amounts", "type": "uint256[]" }
          ],
          "outputs": []
        }],
        functionName: "redeemPositions",
        args: [position.conditionId, amounts]
      }),
      value: "0"
    };

  } else {    //// 标准 CTF 市场赎回
    return {
      to: CTF_ADDRESS,
      data: encodeFunctionData({
        abi: [{
          name: "redeemPositions",
          type: "function",
          inputs: [
            { name: "collateralToken", type: "address" },
            { name: "parentCollectionId", type: "bytes32" },
            { name: "conditionId", type: "bytes32" },
            { name: "indexSets", type: "uint256[]" }
          ],
          outputs: []
        }],
        functionName: "redeemPositions",
        args: [
          USDCe_ADDRESS,
          "0x0000000000000000000000000000000000000000000000000000000000000000",
          position.conditionId,
          [1, 2]  // YES 和 NO
        ]
      }),
      value: "0"
    };
  }




}

/**
 * 尝试领取单个市场奖金（带重试）
 * @param {Object} claimClient - Relayer客户端
 * @param {Object} position - 持仓信息
 */
async function redeemSingleMarket(claimClient, position) {
  try {
    const redeemTx = createRedeemTransaction(position);
    console.log(`  🔄 执行领取交易...`);

    const response = await claimClient.execute(
      [redeemTx],
      `Redeem position: ${position.conditionId?.substring(0, 8)}...`
    );

    await response.wait();
    console.log(`  ✅ 成功领取奖金! 交易哈希: ${response.hash?.substring(0, 10)}...`);
    return true;

  } catch (error) {
    // 检查是否为不可重试的错误
    const isNonRetryable = (
      error.message.includes('already claimed') ||
      error.message.includes('already redeemed') ||
      error.message.includes('Invalid index sets') ||
      error.message.includes('no position to redeem')
    );

    if (isNonRetryable) {
      console.log(`  ⚠️  该市场可能已领取过或条件不匹配`);
      return false;
    }

    console.error(`  ❌ 领取失败:`, error.message);
    return false;
  }
}

/**
 * 获取账户统计信息
 * @param {Object} client - CLOB客户端
 * @param {Object} claimClient - Relayer客户端
 */
async function getAccountStats(client, claimClient) {
  const stats = {
    totalValue: 0,
    positions: [],
    availableUSDC: 0,
    redeemedMarkets: 0,
    totalAssets: 0,
    totalPnl: 0,
    totalRealizedPnl: 0
  };

  try {
    console.log("\n=== 获取账户统计信息 ===");

    // 1. 获取可用 USDC 余额（放在最前面检查）
    try {
      stats.availableUSDC = await getAvailableBalance(client);
      console.log(`\n💰 可用 USDC: $${stats.availableUSDC.toFixed(2)}`);

      if (stats.availableUSDC < MIN_AVAILABLE_BALANCE) {
        console.log(`⚠️ 警告：可用余额小于$${MIN_AVAILABLE_BALANCE}，将无法进行新的买入交易`);
      }
    } catch (error) {
      console.error("获取USDC余额失败:", error.message);
    }

    // 2. 获取持仓总价值
    try {
      const valueResponse = await httpGet(`https://data-api.polymarket.com/value?user=${FUNDER_ADDRESS}`);
      if (valueResponse && Array.isArray(valueResponse) && valueResponse.length > 0) {
        stats.totalValue = valueResponse[0].value;
        console.log(`📊 持仓总价值: $${stats.totalValue.toFixed(2)}`);
      }
    } catch (error) {
      console.error("获取总价值时出错:", error.message);
    }

    // 3. 获取当前持仓
    try {
      const positionsResponse = await httpGet(`https://data-api.polymarket.com/positions?user=${FUNDER_ADDRESS}`);
      if (positionsResponse && Array.isArray(positionsResponse)) {
        stats.positions = positionsResponse;
        console.log(`📈 持仓数量: ${stats.positions.length} 个市场`);

        // 计算总盈亏
        stats.totalPnl = stats.positions.reduce((sum, pos) => sum + (pos.cashPnl || 0), 0);
        stats.totalRealizedPnl = stats.positions.reduce((sum, pos) => sum + (pos.realizedPnl || 0), 0);

        console.log(`💰 总浮动盈亏: $${stats.totalPnl.toFixed(2)}`);
        if (stats.totalRealizedPnl > 0) {
          console.log(`💵 总已实现盈亏: $${stats.totalRealizedPnl.toFixed(2)}`);
        }
      }
    } catch (error) {
      console.error("获取持仓时出错:", error.message);
    }

    // 4. 计算总资产
    stats.totalAssets = stats.totalValue + stats.availableUSDC;
    console.log(`\n📈 总资产: $${stats.totalAssets.toFixed(2)}`);

    // 显示资产构成
    if (stats.totalAssets > 0) {
      const portfolioPercentage = ((stats.totalValue / stats.totalAssets) * 100).toFixed(1);
      const cashPercentage = ((stats.availableUSDC / stats.totalAssets) * 100).toFixed(1);
      console.log(`   📊 资产构成:`);
      console.log(`      🏦 投资组合: ${portfolioPercentage}% ($${stats.totalValue.toFixed(2)})`);
      console.log(`      💰 可用现金: ${cashPercentage}% ($${stats.availableUSDC.toFixed(2)})`);

      // 显示余额警告
      if (stats.availableUSDC < 5) {
        console.log(`   ⚠️  余额警告：可用现金不足$5，建议充值`);
      }
    }

    // 5. 批量领取已结算市场的奖金（可以增加余额）
    await redeemMarkets(claimClient, stats);

    return stats;
  } catch (error) {
    console.error("获取账户统计信息失败:", error.message);
    return stats;
  }
}

/**
 * 批量领取市场奖金
 * @param {Object} claimClient - Relayer客户端
 * @param {Object} stats - 统计数据对象
 */
async function redeemMarkets(claimClient, stats) {
  try {
    // 检查是否有可领取的持仓
    const redeemablePositions = stats.positions.filter(position => position.redeemable === true);
    console.log(`\n🎯 发现 ${redeemablePositions.length} 个可领取的市场`);

    if (redeemablePositions.length === 0) {
      console.log(`  📭 当前没有可领取的市场`);
      return;
    }

    let successCount = 0;

    for (const position of redeemablePositions) {
      console.log(`\n  正在处理市场: ${position.title?.substring(0, 30) || position.conditionId?.substring(0, 8)}...`);
      console.log(`  当前价值: $${position.currentValue?.toFixed(2) || '0.00'}`);

      const success = await redeemSingleMarket(claimClient, position);
      if (success) {
        successCount++;
        stats.redeemedMarkets++;
      }

      // 领取后短暂延迟
      await delay(500);
    }

    if (successCount > 0) {
      console.log(`\n✅ 成功领取 ${successCount} 个市场的奖金`);
    }
  } catch (error) {
    console.error("处理奖金领取时出错:", error.message);
  }
}

// ==================== 主循环函数 ====================

/**
 * 单次循环执行
 * @param {Object} client - CLOB客户端
 * @param {string[]} smartAddresses - 智能钱包地址列表
 * @param {number} cycleNumber - 当前循环次数
 */
async function executeCycle(client, smartAddresses, cycleNumber) {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`🚀 开始第 ${cycleNumber} 次循环扫描`);
  console.log(`📅 ${moment().format('YYYY-MM-DD HH:mm:ss')}`);
  console.log(`${'='.repeat(50)}`);

  const startTime = Date.now();
  const results = [];

  // 循环处理每个钱包
  for (let i = 0; i < smartAddresses.length; i++) {
    const walletAddress = smartAddresses[i];
    const result = await processWallet(client, walletAddress, cycleNumber);
    results.push(result);

    // 钱包间延迟（除了最后一个）
    if (i < smartAddresses.length - 1) {
      await delay(SCAN_DELAY_MS);
    }
  }

  // 统计本次循环结果
  const totalProcessed = results.reduce((sum, r) => sum + r.processed, 0);
  const totalSuccess = results.reduce((sum, r) => sum + r.success, 0);
  const elapsedTime = Date.now() - startTime;
  const shouldPrintDetail = totalProcessed > 0 || totalSuccess > 0;

  if (shouldPrintDetail) {

    console.log(`\n📊 [循环 ${cycleNumber}] 扫描完成`);
    console.log(`⏱️  耗时: ${(elapsedTime / 1000).toFixed(2)} 秒`);
    console.log(`🔍 扫描钱包: ${smartAddresses.length} 个`);
    console.log(`📈 发现交易: ${totalProcessed} 笔`);
    console.log(`✅ 成功跟单: ${totalSuccess} 笔`);

    if (totalProcessed > 0) {
      const successRate = (totalSuccess / totalProcessed) * 100;
      console.log(`🎯 成功率: ${successRate.toFixed(1)}%`);

      if (successRate >= 80) {
        console.log(`🌟 表现优秀!`);
      } else if (successRate >= 50) {
        console.log(`👍 表现良好`);
      } else {
        console.log(`⚠️  成功率偏低，请检查`);
      }
    }

    // 📋 各钱包跟单详情
    console.log(`\n📋 各钱包跟单详情:`);
    results.forEach((result, index) => {
      const walletShort =
        result.wallet.substring(0, 6) + '...' + result.wallet.substring(38);
      console.log(
        `  ${index + 1}. ${walletShort}: ${result.success}/${result.processed}`
      );
    });

    // 📊 累计跟单详细统计
    console.log(`\n📊 累计跟单详细统计:`);
    console.log(`${'='.repeat(50)}`);

    const allWallets = new Set([
      ...Object.keys(globalStats.walletTrades),
      ...Object.keys(globalStats.walletFailedTrades)
    ]);

    if (allWallets.size === 0) {
      console.log(`  暂无跟单记录`);
    } else {
      Array.from(allWallets).forEach((wallet, index) => {
        const successTrades = globalStats.walletTrades[wallet] || [];
        const failedTrades = globalStats.walletFailedTrades[wallet] || [];
        const totalAmount = successTrades.reduce(
          (sum, t) => sum + parseFloat(t.amount),
          0
        );

        console.log(`\n${index + 1}. 钱包: ${wallet}`);

        // 显示成功跟单
        if (successTrades.length > 0) {
          console.log(`   ✅ 成功跟单: ${successTrades.length} 笔`);
          console.log(`   💰 总金额: $${totalAmount.toFixed(2)}`);
          console.log(`   详细记录:`);

          successTrades.forEach((trade, idx) => {
            const followedWalletInfo = trade.followedWallet ? `| 跟随: ${trade.followedWallet}` : '';
            console.log(`      ${idx + 1}) 交易时间: ${trade.tradeTime} | 跟单时间: ${trade.followTime} | ${trade.side} | $${parseFloat(trade.amount).toFixed(2)} | ${trade.market} ${followedWalletInfo}`);
          });
        }

        // 显示失败跟单
        if (failedTrades.length > 0) {
          console.log(`\n   ❌ 失败跟单: ${failedTrades.length} 笔`);
          console.log(`   失败详情:`);

          failedTrades.forEach((trade, idx) => {
            const followedWalletInfo = trade.followedWallet ? `| 跟随: ${trade.followedWallet}` : '';
            console.log(`      ${idx + 1}) 交易时间: ${trade.tradeTime} | 跟单时间: ${trade.followTime} | ${trade.side} | ${trade.market} | 原因: ${trade.reason} ${followedWalletInfo}`);
          });
        }
      });
    }

    console.log(`\n${'='.repeat(50)}`);
  }

  // 验证待确定的单子
  await verifyPendingTrades(client, cycleNumber);

  return { cycleNumber, totalProcessed, totalSuccess, elapsedTime, results };
}

/**
 * 优雅关闭处理器
 * @param {Object} stats - 统计数据对象（引用传递，可以获取最新值）
 */
function createShutdownHandler(stats) {
  return async () => {
    console.log('\n🛑 收到关闭信号，正在停止程序...');

    // 显示总统计
    console.log(`\n${'='.repeat(50)}`);
    console.log('📊 程序运行总统计');
    console.log(`${'='.repeat(50)}`);
    console.log(`总循环次数: ${stats.cycleCount}`);
    console.log(`总处理交易: ${stats.totalTradesProcessed}`);
    console.log(`总成功跟单: ${stats.totalTradesSuccess}`);
    if (stats.totalTradesProcessed > 0) {
      const rate = (stats.totalTradesSuccess / stats.totalTradesProcessed) * 100;
      console.log(`成功率: ${rate.toFixed(1)}%`);
    }
    console.log(`📅 ${moment().format('YYYY-MM-DD HH:mm:ss')}`);
    console.log(`${'='.repeat(50)}`);

    // 等待当前循环完成
    await delay(1000);
    console.log('✅ 程序已安全停止');
    process.exit(0);
  };
}

/**
 * 初始化客户端
 */
async function initializeClients(signer) {
  console.log("🔧 初始化API客户端...");

  const apiClient = new ClobClient(HOST, CHAIN_ID, signer);
  const apiCreds = await apiClient.createOrDeriveApiKey();

  // 创建带代理的客户端
  const client = new ClobClient(
    HOST,
    CHAIN_ID,
    signer,
    apiCreds,
    SIGNATURE_TYPE,
    FUNDER_ADDRESS
  );

  // 创建Relayer客户端用于领取奖金
  const builderCreds = {
    key: POLY_BUILDER_API_KEY,
    secret: POLY_BUILDER_SECRET,
    passphrase: POLY_BUILDER_PASSPHRASE,
  };
  const builderConfig = new BuilderConfig({
    localBuilderCreds: builderCreds
  });
  const claimClient = new RelayClient(
    Relayer_HOST,
    CHAIN_ID,
    signer,
    builderConfig,
    RelayerTxType.SAFE
  );

  return { client, claimClient };
}

/**
 * 主循环函数
 */
async function mainLoop() {
  // 验证环境变量
  const SMART_ADDRESSES = validateEnvironmentVariables();

  // 初始化
  const signer = initializeSigner();
  const { client, claimClient } = await initializeClients(signer);

  // 显示启动信息
  console.log(`\n${'='.repeat(50)}`);
  console.log(`🤖 跟单机器人启动（循环模式）`);
  console.log(`📊 跟踪钱包: ${SMART_ADDRESSES.length} 个`);
  console.log(`🎯 跟单比例: ${FOLLOW_VALUE}`);
  console.log(`💰 最小订单金额: $${MIN_ORDER_AMOUNT}`);
  console.log(`💰 最大订单金额: $${MAX_ORDER_AMOUNT}`);
  console.log(`💰 聪明钱包最小金额: $${MIN_FOLLOW_AMOUNT}`);
  console.log(`💰 最小余额要求: $${MIN_AVAILABLE_BALANCE}（低于此值将不执行买入）`);
  console.log(`⏱️  循环间隔: ${CYCLE_INTERVAL_MS / 1000} 秒`);
  console.log(`${'='.repeat(50)}\n`);

  // 使用对象存储统计数据，方便引用传递
  const stats = {
    cycleCount: 0,
    totalTradesProcessed: 0,
    totalTradesSuccess: 0
  };
  let isRunning = true;
  let lastRedeemTime = 0;  // ← 新增：上次领取时间（时间戳）


  // 设置优雅关闭处理器
  const shutdown = createShutdownHandler(stats);
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // 主循环
  while (isRunning) {
    // 检查是否到达设定的关闭时间（北京时间）
    const beijingTime = moment().utcOffset(8);
    const currentHour = beijingTime.hour();
    const currentMinute = beijingTime.minute();

    if (currentHour === AUTO_CLOSE_HOUR && currentMinute >= AUTO_CLOSE_MINUTE) {
      console.log(`\n⏰ 已到达北京时间 ${AUTO_CLOSE_HOUR}:${AUTO_CLOSE_MINUTE.toString().padStart(2, '0')}，程序自动关闭`);
      await shutdown();
      return;
    }
    // 检查是否达到买入上限且所有买入的仓位都已清仓
    if (globalStats.totalBuyCount >= MAX_BUY_COUNT && globalStats.buyPositions.size > 0) {
      try {
        const myPositions = await httpGet(
          `https://data-api.polymarket.com/positions?user=${FUNDER_ADDRESS}`
        );

        if (Array.isArray(myPositions)) {
          const currentPositionIds = new Set(
            myPositions
              .filter(p => Number(p.size) > 0)
              .map(p => p.conditionId)
          );

          // 检查买入的仓位是否还存在
          let hasAnyBuyPosition = false;
          for (const conditionId of globalStats.buyPositions) {
            if (currentPositionIds.has(conditionId)) {
              hasAnyBuyPosition = true;
              break;
            }
          }

          if (!hasAnyBuyPosition) {
            console.log('\n🎯 已达到买入上限且所有买入仓位已清仓，程序自动关闭');
            console.log(`   买入次数: ${globalStats.totalBuyCount}/${MAX_BUY_COUNT}`);
            console.log(`   买入的市场数: ${globalStats.buyPositions.size}`);
            console.log(`   当前持仓数: ${currentPositionIds.size}`);
            await shutdown();
            return;
          }
        }
      } catch (error) {
        console.error('检查持仓状态失败:', error.message);
      }
    }

    stats.cycleCount++;

    try {

      // 执行单次循环
      const result = await executeCycle(client, SMART_ADDRESSES, stats.cycleCount);

      // ===== Step A：判断“本轮是否安静”（新增）=====
const isQuietThisCycle =
  result.totalProcessed === 0 &&
  result.totalSuccess === 0 &&
  (!globalStats.pendingVerification ||
    globalStats.pendingVerification.length === 0);

      // 更新总统计
      stats.totalTradesProcessed += result.totalProcessed;
      stats.totalTradesSuccess += result.totalSuccess;

      // ===== 新增：按时间间隔领取奖金 =====
      const shouldPrintRedeemInfo =
        result.totalProcessed > 0 ||
        result.totalSuccess > 0 ||
        (globalStats.pendingVerification &&
          globalStats.pendingVerification.length > 0);

      const REDEEM_INTERVAL_HOURS = 24;  // 每24小时领取一次
      const currentTime = Date.now();
      const timeSinceLastRedeem = currentTime - lastRedeemTime;
      const redeemIntervalMs = REDEEM_INTERVAL_HOURS * 60 * 60 * 1000;

      if (timeSinceLastRedeem >= redeemIntervalMs || lastRedeemTime === 0) {
        console.log(`\n🎁 距离上次领取已过 ${(timeSinceLastRedeem / 1000 / 60 / 60).toFixed(1)} 小时，执行领取奖金...`);
        await getAccountStats(client, claimClient);
        lastRedeemTime = currentTime;
      } else {
        if (shouldPrintRedeemInfo) {
          const availableBalance = await getAvailableBalance(client);
          console.log(`\n💰 当前可用余额: $${availableBalance.toFixed(2)}`);

          const nextRedeemIn = (redeemIntervalMs - timeSinceLastRedeem) / 1000 / 60;
          console.log(`⏰ 下次领取时间: ${Math.ceil(nextRedeemIn)} 分钟后`);
        }
      }

      // ===== 修改结束 =====

      // 显示当前运行统计

const shouldPrintRuntimeStats =
  result.totalProcessed > 0 ||
  result.totalSuccess > 0;



      if (shouldPrintRuntimeStats) {
        console.log(`\n📈 当前运行统计:`);
        console.log(`   循环次数: ${stats.cycleCount}`);
        console.log(`   累计处理: ${stats.totalTradesProcessed}`);
        console.log(`   累计成功: ${stats.totalTradesSuccess}`);
        console.log(`   累计买入: ${globalStats.totalBuyCount}/${MAX_BUY_COUNT} 次`);
if (result.totalProcessed > 0) {
  const rate =
    (result.totalSuccess / result.totalProcessed) * 100;
  console.log(`成功率: ${rate.toFixed(1)}%`);
}

      }

      // ===== Step 2：低频心跳日志 =====
const shouldHeartbeat =
  stats.cycleCount % HEARTBEAT_INTERVAL === 0;


      if (shouldHeartbeat) {
        console.log(
          `💤 心跳：已运行 ${stats.cycleCount} 轮 | ` +
          `成功 ${stats.totalTradesSuccess} | ` +
          `BUY ${globalStats.totalBuyCount}/${MAX_BUY_COUNT}`
        );
      }

      // ===== 等待下一轮 =====
      const remainingTime = CYCLE_INTERVAL_MS - result.elapsedTime;

      if (shouldPrintRuntimeStats && remainingTime > 0) {
        console.log(`\n⏳ 等待 ${Math.ceil(remainingTime / 1000)} 秒后开始下一次扫描...`);
        console.log(`📅 下次扫描时间: ${moment().add(remainingTime, 'ms').format('HH:mm:ss')}`);
        console.log(`${'-'.repeat(50)}`);
      }

      if (remainingTime > 0) {
        await delay(remainingTime);
      } else {
        console.log('\n⚠️ 上次扫描耗时过长，立即开始下一次扫描...');
      }

    } catch (error) {
      console.error(`❌ 第 ${stats.cycleCount} 次循环执行失败:`, error.message);
      console.log(`⏳ 等待 ${CYCLE_INTERVAL_MS / 2000} 秒后重试...`);
      await delay(CYCLE_INTERVAL_MS / 2);
    }
  }
}

// ==================== 程序入口 ====================

// 启动程序
mainLoop().catch(error => {
  console.error("❌ 程序运行失败:", error.message);
  console.error("错误堆栈:", error.stack);
  process.exit(1);
});



