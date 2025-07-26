const CryptoJS = require('crypto-js');
const readline = require('readline');

// 创建接口以获取用户输入
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true
});

// 提问函数
function askQuestion(question) {
    return new Promise((resolve) => {
        rl.question(question, (answer) => {
            resolve(answer);
            rl.close();
        });
    });
}

// 解密函数
function AES_decrypt(text, key) {
    const iv = CryptoJS.enc.Utf8.parse('abcdef1234567890');  // 16 字节初始化向量（IV）
    const decrypted = CryptoJS.AES.decrypt(text, key, {
        iv: iv,
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7
    });
    return decrypted.toString(CryptoJS.enc.Utf8);
}

// 主函数
const main = async () => {
    const inputKey = await askQuestion('请输入密钥: ');
    const encryptedText = ''; // 替换为加密字符串

    const decryptedText = AES_decrypt(encryptedText, inputKey);
    console.log('解密结果:', decryptedText);
};

main();
