#!/usr/bin/env python3

from hdwallet import BIP44HDWallet
from hdwallet.cryptocurrencies import EthereumMainnet
from hdwallet.derivations import BIP44Derivation
from hdwallet.utils import generate_mnemonic
from typing import Optional

# 生成英文助记词 Generate english mnemonic words
MNEMONIC: str = generate_mnemonic(language="english", strength=128)
# 助记词是否加盐 Secret passphrase/password for mnemonic
PASSPHRASE: Optional[str] = None  # "meherett"

# 初始化以太坊主网 BIP44 分层前确定性钱包 Initialize Ethereum mainnet BIP44HDWallet
bip44_hdwallet: BIP44HDWallet = BIP44HDWallet(cryptocurrency=EthereumMainnet)
# 从助记词获取以太坊 BIP44 分层确定性钱包 Get Ethereum BIP44HDWallet from mnemonic
bip44_hdwallet.from_mnemonic(
    mnemonic=MNEMONIC, language="english", passphrase=PASSPHRASE
)
# 清理默认 BIP44 派生索引/路径 Clean default BIP44 derivation indexes/paths
bip44_hdwallet.clean_derivation()

print("Mnemonic:", bip44_hdwallet.mnemonic())
print("Base HD Path:  m/44'/60'/0'/0/{address_index}", "\n")

# 从地址索引中获取以太坊 BIP44 HD 钱包信息 Get Ethereum BIP44HDWallet information's from address index
for address_index in range(100):
    # 从以太坊 BIP44 推导路径推导  Derivation from Ethereum BIP44 derivation path
    bip44_derivation: BIP44Derivation = BIP44Derivation(
        cryptocurrency=EthereumMainnet, account=0, change=False, address=address_index
    )
    # 推导以太坊 BIP44 HD 钱包 Drive Ethereum BIP44HDWallet
    bip44_hdwallet.from_path(path=bip44_derivation)
    # 打印 地址索引，路径，地址，私钥 Print address_index, path, address and private_key
    print(f"({address_index}) {bip44_hdwallet.path()} {bip44_hdwallet.address()} 0x{bip44_hdwallet.private_key()}")
    # 清理派生索引/路径 Clean derivation indexes/paths
    bip44_hdwallet.clean_derivation()