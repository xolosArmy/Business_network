/**
 * Recover the exact minted artwork from its on-chain IPFS metadata.
 * The expected SHA-256 is the independently calculated hash of the original PNG.
 * Fails closed: never publishes a different image.
 */
import { ChronikClient } from 'chronik-client'
import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'

const TOKEN_ID = '717d555b1ecc1f701c8273fe3fb4d80954d1eca26874188584e6facd9f0634ba'
const PARENT_ID = 'd6ff881413733a1a6407fa5e1e86537e5fc9f48246bae89b732ca7044993e57a'
const EXPECTED_IMAGE_SHA256 = '7d05313c724e45cbc8e8daf9124dc18b36902de242f13991f313df19e2da6709'
const TARGET = 'assets/colectividad-xoloitzcuintle/encarnacion-de-xolotl.png'
const CHRONIK = ['https://chronik.e.cash', 'https://chronik.xolosarmy.xyz']
const GATEWAYS = [
  'https://tomato-rational-rat-921.mypinata.cloud/ipfs/',
  'https://gateway.pinata.cloud/ipfs/',
  'https://dweb.link/ipfs/',
  'https://ipfs.io/ipfs/'
]

const cidOf = (value) => {
  if (typeof value !== 'string' || !value.startsWith('ipfs://')) throw new Error('Expected an ipfs:// URI')
  const path = value.slice('ipfs://'.length)
  if (!/^(bafy[a-z2-7]{20,}|Qm[1-9A-HJ-NP-Za-km-z]{44})(\/.*)?$/.test(path)) throw new Error('Invalid IPFS CID')
  return path
}

async function fetchIpfs(path, asJson = false) {
  let lastError
  for (const gateway of GATEWAYS) {
    try {
      const response = await fetch(gateway + path, { signal: AbortSignal.timeout(20000), headers: { Accept: asJson ? 'application/json' : 'image/png' } })
      if (!response.ok) throw new Error('HTTP ' + response.status)
      if (asJson) return await response.json()
      const size = Number(response.headers.get('content-length') || 0)
      if (size > 10000000) throw new Error('Oversized image')
      return Buffer.from(await response.arrayBuffer())
    } catch (error) {
      lastError = error
      console.warn('Gateway unavailable:', gateway, error.message)
    }
  }
  throw new Error('All IPFS gateways failed: ' + lastError?.message)
}

const client = new ChronikClient(CHRONIK)
const info = await client.token(TOKEN_ID)
if (info.tokenId !== TOKEN_ID || info.tokenType?.number !== 65 || info.tokenType?.protocol !== 'SLP') {
  throw new Error('Invalid NFT1 Child token information')
}
const genesis = await client.tx(TOKEN_ID)
const childEntries = genesis.tokenEntries?.filter(entry => entry.tokenId === TOKEN_ID && entry.txType === 'GENESIS' && entry.tokenType?.number === 65 && entry.isInvalid === false) || []
const childEntry = childEntries.length === 1 ? childEntries[0] : null
const groupEntry = genesis.tokenEntries?.find(entry => entry.tokenId === PARENT_ID && entry.tokenType?.number === 129 && entry.isInvalid === false)
const inputGroup = genesis.inputs?.[0]?.token
if (genesis.tokenStatus !== 'TOKEN_STATUS_NORMAL' || genesis.txid !== TOKEN_ID || genesis.tokenFailedParsings?.length !== 0 ||
    childEntry?.groupTokenId !== PARENT_ID || !groupEntry ||
    inputGroup?.tokenId !== PARENT_ID || inputGroup.tokenType?.number !== 129 ||
    inputGroup.atoms !== 1n || inputGroup.isMintBaton !== false) {
  throw new Error('NFT1 child genesis does not prove xolosArmy Community parent ancestry')
}
const uri = info.genesisInfo?.url
const metadata = await fetchIpfs(cidOf(uri), true)
if (metadata.name !== 'Encarnación de Xolotl') throw new Error('Unexpected NFT name')
if (metadata.parent?.toLowerCase() !== PARENT_ID) throw new Error('Unexpected metadata parent')
const bytes = await fetchIpfs(cidOf(metadata.image))
if (!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) throw new Error('Not a PNG')
const actual = createHash('sha256').update(bytes).digest('hex')
if (actual !== EXPECTED_IMAGE_SHA256) throw new Error('Artwork SHA-256 mismatch: ' + actual)
await mkdir('assets/colectividad-xoloitzcuintle', { recursive: true })
await writeFile(TARGET, bytes)
console.log('Verified artwork recovered from on-chain metadata:', TARGET, bytes.length, 'bytes; SHA256', actual)
