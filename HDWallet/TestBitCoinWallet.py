#!/usr/bin/env python3

from hdwallet import HDWallet
from hdwallet.utils import generate_entropy
from hdwallet.symbols import BTC as SYMBOL
from typing import Optional

import json

# 选择强度 Choose strength 128, 160, 192, 224 or 256
STRENGTH: int = 128  # Default is 128
# 选择语言 Choose language english, french, italian, spanish, chinese_simplified, chinese_traditional, japanese or korean
LANGUAGE: str = "english"  # Default is english
# 生成新的熵 16 进制字符串 Generate new entropy hex string
ENTROPY: str = generate_entropy(strength=STRENGTH)
# 助记词是否加盐 Secret passphrase for mnemonic
PASSPHRASE: Optional[str] = None  # "meherett"

# 初始化比特币主网 HD 钱包 Initialize Bitcoin mainnet HDWallet
hdwallet: HDWallet = HDWallet(symbol=SYMBOL, use_default_path=False)
# 从熵中获取比特币 HD 钱包 Get Bitcoin HDWallet from entropy
hdwallet.from_entropy(
    entropy=ENTROPY, language=LANGUAGE, passphrase=PASSPHRASE
)

# 从路径推导 Derivation from path
# hdwallet.from_path("m/44'/0'/0'/0/0")
# 从索引推导 Or derivation from index
hdwallet.from_index(44, hardened=True)
hdwallet.from_index(0, hardened=True)
hdwallet.from_index(0, hardened=True)
hdwallet.from_index(0)
hdwallet.from_index(0)

# 打印所有比特币高清钱包信息 Print all Bitcoin HDWallet information's
print(json.dumps(hdwallet.dumps(), indent=4, ensure_ascii=False))