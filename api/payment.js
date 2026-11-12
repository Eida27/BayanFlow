import { createPublicClient, decodeEventLog, getAddress, http, isAddress, parseAbi, parseEther } from 'viem'
import { bscTestnet } from 'viem/chains'
import { privateKeyToAccount } from 'viem/accounts'

export const amount = parseEther('0.001')
const abi = parseAbi([
  'event PaymentReceived(bytes32 indexed referenceId, address indexed payer, uint256 amount)',
  'function signer() view returns (address)'
])
const event = abi[0]
const types = { Payment: [
  { name: 'referenceId', type: 'bytes32' }, { name: 'payer', type: 'address' },
  { name: 'amount', type: 'uint256' }, { name: 'deadline', type: 'uint256' }
] }

export function paymentGateway(env) {
  if (!env.PAYMENT_SIGNER_PRIVATE_KEY || !isAddress(env.PAYMENT_CONTRACT_ADDRESS ?? '')) return null
  const contract = getAddress(env.PAYMENT_CONTRACT_ADDRESS)
  const signer = privateKeyToAccount(env.PAYMENT_SIGNER_PRIVATE_KEY)
  const client = createPublicClient({ chain: bscTestnet, transport: http(env.BSC_TESTNET_RPC_URL, { timeout: 10000 }) })
  const same = (left, right) => left?.toLowerCase() === right?.toLowerCase()

  return {
    contract,
    async currentBlock() {
      const [chainId, configuredSigner, block] = await Promise.all([
        client.getChainId(),
        client.readContract({ address: contract, abi, functionName: 'signer' }),
        client.getBlockNumber()
      ])
      if (chainId !== bscTestnet.id || !same(configuredSigner, signer.address)) throw new Error('Unexpected chain or payment signer')
      return block
    },
    async authorize(payment) {
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 900)
      const signature = await signer.signTypedData({
        domain: { name: 'BayanFlow', version: '1', chainId: bscTestnet.id, verifyingContract: contract },
        types, primaryType: 'Payment',
        message: { referenceId: payment.reference_id, payer: payment.payer, amount: BigInt(payment.amount), deadline }
      })
      return { contract, referenceId: payment.reference_id, amount: payment.amount, deadline: deadline.toString(), signature }
    },
    async verify(payment, hash) {
      if (await client.getChainId() !== bscTestnet.id) throw new Error('Unexpected RPC chain')
      if (!hash) {
        const fromBlock = BigInt(payment.authorization_block)
        const tip = await client.getBlockNumber()
        // Recent demo payments can recover without a browser-stored transaction hash.
        const windowStart = tip > 9999n ? tip - 9999n : 0n
        const logs = await client.getLogs({
          address: contract, event, strict: true,
          args: { referenceId: payment.reference_id, payer: payment.payer },
          fromBlock: fromBlock > windowStart ? fromBlock : windowStart, toBlock: tip
        })
        hash = logs[0]?.transactionHash
        if (!hash) return null
      }
      let receipt
      try {
        receipt = await client.getTransactionReceipt({ hash })
      } catch (error) {
        if (error.name === 'TransactionReceiptNotFoundError') return null
        throw error
      }
      if (receipt.status !== 'success' || !same(receipt.to, contract) || !same(receipt.from, payment.payer)) return null
      const matched = receipt.logs.some(log => {
        if (!same(log.address, contract)) return false
        try {
          const result = decodeEventLog({ abi, data: log.data, topics: log.topics })
          return result.eventName === 'PaymentReceived' && same(result.args.referenceId, payment.reference_id) &&
            same(result.args.payer, payment.payer) && result.args.amount === BigInt(payment.amount)
        } catch {
          return false
        }
      })
      return matched ? receipt.transactionHash : null
    }
  }
}
