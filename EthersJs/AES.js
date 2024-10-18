const CryptoJS = require('crypto-js');
const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true
});

// 获取用户输入的密钥
function askForKey() {
    return new Promise((resolve) => {
        rl.question('请输入密钥: ', (answer) => {
            resolve(answer);
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

// 加密函数
function AES_encrypt(text, key) {
    const iv = CryptoJS.enc.Utf8.parse('abcdef1234567890');  // 16 字节初始化向量（IV）
    const encrypted = CryptoJS.AES.encrypt(text, key, {
        iv: iv,
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7
    });
    return encrypted.toString();
}

const main = async () => {
    const inputKey = await askForKey();
    rl.close();

    const plaintext = '';  // 需要加密的内容
    const encryptedText = AES_encrypt(plaintext, inputKey);
    console.log('加密后的文本:', encryptedText);
    
    const decryptedText = AES_decrypt(encryptedText, inputKey);
    console.log('解密后的文本:', decryptedText);
};

main();
