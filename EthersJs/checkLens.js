const { ethers } = require('ethers');
const fs = require('fs');

// 配置你的以太坊提供者
const provider = new ethers.JsonRpcProvider('');

// ERC721 合约地址和 ABI
const contractAddress = '0xDb46d1Dc155634FbC732f92E853b10B288AD5a1d';
const abi = [
    "function balanceOf(address owner) view returns (uint256)"
];

// 创建合约实例
const contract = new ethers.Contract(contractAddress, abi, provider);

async function checkNFTOwnership(walletAddress) {
    const balance = await contract.balanceOf(walletAddress);
    const balanceNumber = balance.toString();
    console.log(`地址 ${walletAddress} 拥有 ${balanceNumber} 个 NFT`);
    return balanceNumber === '0' ? walletAddress : null; // 返回余额为0的地址
}

async function checkBalancesFromFile(filePath) {
    const data = fs.readFileSync(filePath, 'utf-8');
    const walletAddresses = data.split('\n').filter(Boolean); // 过滤空行
    const zeroBalanceAddresses = []; // 存储余额为0的地址

    for (const walletAddress of walletAddresses) {
        const zeroBalanceAddress = await checkNFTOwnership(walletAddress.trim());
        if (zeroBalanceAddress) {
            zeroBalanceAddresses.push(zeroBalanceAddress);
        }
    }

    // 打印余额为0的钱包地址
    if (zeroBalanceAddresses.length > 0) {
        console.log('余额为0的钱包地址:');
        zeroBalanceAddresses.forEach(address => console.log(address));
    }
}

// 文件路径
const filePath = '';
checkBalancesFromFile(filePath).catch(console.error);
