import { ethers } from "ethers";

// 1. 创建HD钱包
console.log(`\n1. 创建HD钱包`)
// 自定义助记词
// const mnemonic = '';
// 1.1 随机生成助记词，16为12个单词
const mnemonic = ethers.Mnemonic.entropyToPhrase(ethers.randomBytes(16))
console.log(mnemonic)
// 基路径："m / purpose' / coin_type' / account' / change"
const basePath = "44'/60'/0'/0"
const baseWallet = ethers.HDNodeWallet.fromPhrase(mnemonic,'',basePath)
console.log(baseWallet);

// 2. 通过HD钱包派生20个钱包
console.log("\n2. 通过HD钱包派生20个钱包")
const numWallet = 20
// 派生路径：基路径 + "/ address_index"
// 提供最后一位address_index的字符串格式，就可以从baseWallet派生出新钱包
let wallets = [];
for (let i = 0; i < numWallet; i++) {
    let baseWalletNew = baseWallet.derivePath(i.toString());
    // let baseWalletNew = baseWallet.deriveChild(i); // 直接传入地址索引
    console.log(`第${i+1}个钱包地址： ${baseWalletNew.address}`)
    console.log(`第${i+1}个钱包私钥： ${baseWalletNew.privateKey}`)

    wallets.push(baseWalletNew);
}