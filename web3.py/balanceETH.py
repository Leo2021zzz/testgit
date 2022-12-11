from web3 import Web3, HTTPProvider

# 填入钱包地址，RPC 地址
address = ''
rpc = ''

web3 = Web3(HTTPProvider(rpc))
balance = web3.fromWei(web3.eth.getBalance(address), "ether")
print(balance)