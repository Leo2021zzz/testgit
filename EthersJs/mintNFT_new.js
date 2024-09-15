// 共要铸造 x 个NFT
// 轮询 TokenId 是否存在，不存在则按照顺序铸造

import { ethers } from "ethers";
import dotenv from 'dotenv';
dotenv.config();

// 设置RPC
const INFURA_HOLESKY_URL = process.env.INFURA_HOLESKY;
const provider = new ethers.JsonRpcProvider(INFURA_HOLESKY_URL)

// 设置钱包
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY);

// 连接到钱包
const connectedWallet = wallet.connect(provider);

const abi = [
  // 合约abi    
  "function mint(address usr, uint256 wad)",
];

// 设置合约地址和 ABI
const contractAddress = '0xff2Ce73c17ffCa33B5E5118360387c7Ceca14AE7';

// 合约对象
const contract = new ethers.Contract(contractAddress, abi, connectedWallet);

let currentTokenId = 0; // 从0开始

// 获取下一个可用的tokenId
async function getNextTokenId(toAddress) {
  while (true) {
    try {
      await contract.mint.staticCall(toAddress, currentTokenId);
      return currentTokenId++;
    } catch (error) {
      if (error.message.includes('token already minted') || error.message.includes('execution reverted')) {
        currentTokenId++;
      } else {
        throw error;
      }
    }
  }
}

// 铸造NFT函数
async function mint(toAddress) {
  try {
    const tokenId = await getNextTokenId(toAddress);
    const tx = await contract.mint(toAddress, tokenId);
    console.log(`正在铸造TokenId ${tokenId} 到地址 ${toAddress}...`);
    const receipt = await tx.wait();
    console.log(`NFT铸造成功！TokenId: ${tokenId}, 交易哈希: ${receipt.hash}`);
    return true;
  } catch (error) {
    console.error(`铸造NFT时出错:`, error);
    return false;
  }
}

// 使用示例
const toAddress = '0xf074fa31efd3fcfe43bde42298e32d3c7d1345db';

async function mintMultipleNFTs(count) {
  for (let i = 0; i < count; i++) {
    const result = await mint(toAddress);
    if (result) {
      console.log(`第 ${i+1} 个NFT铸造成功`);
    } else {
      console.log(`第 ${i+1} 个NFT铸造失败`);
    }
  }
}

// 铸造8个NFT
mintMultipleNFTs(7)
  .then(() => console.log('所有NFT铸造操作完成'))
  .catch((error) => console.error('铸造过程中出错:', error));
