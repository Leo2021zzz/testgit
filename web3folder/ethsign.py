### 使用钱包对一条消息进行哈希签名

from web3 import Web3
from eth_account.messages import encode_defunct

# 连接到一个以太坊节点，例如Infura
w3 = Web3(Web3.HTTPProvider(''))

# 使用已有账户和私钥
private_key = ''
account = w3.eth.account.from_key(private_key)

# 需要签名的消息
message = ""

# 对消息进行哈希
message_hash = Web3.keccak(text=message)

# 使用 eth_account.messages.encode_defunct 将消息包装为签名所需的格式
encoded_message = encode_defunct(message_hash)

# 使用私钥对消息进行签名
signed_message = account.sign_message(encoded_message)

print("Message:", message)
print("Message Hash:", message_hash.hex())
print("Signature:", signed_message.signature.hex())