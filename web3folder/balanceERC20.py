from web3 import Web3, HTTPProvider
import json

# 填入地址，rpc地址
address = ''
rpc = ''

Token_ADDRESS = Web3.toChecksumAddress('')  # 填入 Token 的合约地址
Token_ABI = json.loads('') # 填入 ABI 数据
web3 = Web3(HTTPProvider(rpc))
token_contract = web3.eth.contract(address=Token_ADDRESS, abi=Token_ABI)
balance = web3.fromWei(token_contract.functions.balanceOf(address).call(), "ether")
print(balance)