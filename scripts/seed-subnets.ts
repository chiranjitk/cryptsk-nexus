import { db } from '../src/lib/db'

// Helper to generate a random MAC address
function randomMac(): string {
  const hex = () =>
    Math.floor(Math.random() * 256)
      .toString(16)
      .padStart(2, '0')
      .toUpperCase()
  return `${hex()}:${hex()}:${hex()}:${hex()}:${hex()}:${hex()}`
}

function generateIpAddresses(
  networkPrefix: string,
  subnetId: string,
): { address: string; status: string; hostname: string; macAddress: string; description: string }[] {
  const ips: { address: string; status: string; hostname: string; macAddress: string; description: string }[] = []

  // .1 - Gateway (reserved)
  ips.push({
    address: `${networkPrefix}.1`,
    status: 'reserved',
    hostname: 'gateway',
    macAddress: '',
    description: 'Gateway',
  })

  // .2 to .10 - Infrastructure (reserved)
  for (let i = 2; i <= 10; i++) {
    ips.push({
      address: `${networkPrefix}.${i}`,
      status: 'reserved',
      hostname: `infra-${i}`,
      macAddress: randomMac(),
      description: `Infrastructure device ${i}`,
    })
  }

  // .11 to .50 - Used by subscribers
  for (let i = 11; i <= 50; i++) {
    ips.push({
      address: `${networkPrefix}.${i}`,
      status: 'used',
      hostname: `subscriber-${i}`,
      macAddress: randomMac(),
      description: `Active subscriber`,
    })
  }

  // .51 to .200 - Free IPs
  for (let i = 51; i <= 200; i++) {
    ips.push({
      address: `${networkPrefix}.${i}`,
      status: 'free',
      hostname: '',
      macAddress: '',
      description: '',
    })
  }

  return ips
}

async function main() {
  console.log('🌍 Seeding subnets and IP addresses...\n')

  // Check if data already exists
  const existingSubnets = await db.subnet.findMany({
    where: {
      name: {
        in: ['Office Network', 'FTTH User Pool', 'Wireless User Pool', 'Leased Line Pool'],
      },
    },
  })

  if (existingSubnets.length > 0) {
    console.log(`⚠️  Found ${existingSubnets.length} existing subnets. Skipping seed to avoid duplicates.`)
    console.log('   Subnet names found:', existingSubnets.map((s) => s.name).join(', '))
    console.log('\n   If you want to re-seed, delete the existing subnets first.')
    return
  }

  // 1. Create VLANs (individually since SQLite doesn't support skipDuplicates in createMany)
  console.log('📋 Creating VLANs...')
  const vlanDefs = [
    { vlanId: 10, name: 'Management', description: 'Management network VLAN', subnet: '10.0.1.0/24' },
    { vlanId: 20, name: 'FTTH Users', description: 'FTTH subscriber network VLAN', subnet: '192.168.1.0/24' },
    { vlanId: 30, name: 'Wireless', description: 'Wireless subscriber network VLAN', subnet: '192.168.2.0/24' },
    { vlanId: 40, name: 'Leased Line', description: 'Leased line subscriber network VLAN', subnet: '172.16.0.0/24' },
  ]
  let vlansCreated = 0
  for (const vlanDef of vlanDefs) {
    await db.vlan.upsert({
      where: { vlanId: vlanDef.vlanId },
      update: {},
      create: vlanDef,
    })
    vlansCreated++
  }
  console.log(`   ✅ Created/verified ${vlansCreated} VLANs`)

  // Fetch the created VLANs to get their IDs
  const vlanRecords = await db.vlan.findMany({
    where: {
      vlanId: { in: [10, 20, 30, 40] },
    },
    orderBy: { vlanId: 'asc' },
  })

  const vlanMap: Record<number, string> = {}
  for (const v of vlanRecords) {
    vlanMap[v.vlanId] = v.id
  }

  // 2. Create Subnets
  console.log('\n🌐 Creating subnets...')
  const subnetsData = [
    {
      name: 'Office Network',
      network: '10.0.1.0',
      cidr: '10.0.1.0/24',
      networkv6: '',
      prefixv6: '',
      gateway: '10.0.1.1',
      dns: '8.8.8.8',
      description: 'Office management network',
      vlanId: vlanMap[10],
    },
    {
      name: 'FTTH User Pool',
      network: '192.168.1.0',
      cidr: '192.168.1.0/24',
      networkv6: '',
      prefixv6: '',
      gateway: '192.168.1.1',
      dns: '8.8.8.8',
      description: 'FTTH subscriber IP pool',
      vlanId: vlanMap[20],
    },
    {
      name: 'Wireless User Pool',
      network: '192.168.2.0',
      cidr: '192.168.2.0/24',
      networkv6: '',
      prefixv6: '',
      gateway: '192.168.2.1',
      dns: '1.1.1.1',
      description: 'Wireless subscriber IP pool',
      vlanId: vlanMap[30],
    },
    {
      name: 'Leased Line Pool',
      network: '172.16.0.0',
      cidr: '172.16.0.0/24',
      networkv6: '',
      prefixv6: '',
      gateway: '172.16.0.1',
      dns: '8.8.4.4',
      description: 'Leased line subscriber IP pool',
      vlanId: vlanMap[40],
    },
  ]

  const createdSubnets = await db.subnet.createMany({
    data: subnetsData,
  })
  console.log(`   ✅ Created ${createdSubnets.count} subnets`)

  // Fetch created subnets to get their IDs
  const subnetRecords = await db.subnet.findMany({
    where: {
      name: { in: subnetsData.map((s) => s.name) },
    },
  })

  const subnetMap: Record<string, string> = {}
  for (const s of subnetRecords) {
    subnetMap[s.name] = s.id
  }

  // 3. Create IP Addresses for each subnet
  console.log('\n📍 Creating IP addresses...')
  let totalIps = 0

  const subnetConfigs = [
    { name: 'Office Network', networkPrefix: '10.0.1' },
    { name: 'FTTH User Pool', networkPrefix: '192.168.1' },
    { name: 'Wireless User Pool', networkPrefix: '192.168.2' },
    { name: 'Leased Line Pool', networkPrefix: '172.16.0' },
  ]

  for (const config of subnetConfigs) {
    const subnetId = subnetMap[config.name]
    if (!subnetId) {
      console.error(`   ❌ Subnet "${config.name}" not found, skipping IPs`)
      continue
    }

    const ips = generateIpAddresses(config.networkPrefix, subnetId)
    const chunkSize = 50 // Insert in chunks for better performance
    let created = 0

    for (let i = 0; i < ips.length; i += chunkSize) {
      const chunk = ips.slice(i, i + chunkSize)
      const result = await db.ipAddress.createMany({
        data: chunk.map((ip) => ({
          address: ip.address,
          status: ip.status,
          hostname: ip.hostname,
          macAddress: ip.macAddress,
          description: ip.description,
          subnetId,
        })),
      })
      created += result.count
    }

    const reservedCount = ips.filter((ip) => ip.status === 'reserved').length
    const usedCount = ips.filter((ip) => ip.status === 'used').length
    const freeCount = ips.filter((ip) => ip.status === 'free').length

    console.log(`   ✅ ${config.name} (${config.networkPrefix}.0/24): ${created} IPs`)
    console.log(`      ├─ Reserved: ${reservedCount} (.1 gateway, .2-.10 infrastructure)`)
    console.log(`      ├─ Used:     ${usedCount} (.11-.50 subscribers)`)
    console.log(`      └─ Free:     ${freeCount} (.51-.200 available)`)

    totalIps += created
  }

  // Summary
  console.log('\n📊 Seed Summary:')
  console.log(`   VLANs created:       ${vlanRecords.length}`)
  console.log(`   Subnets created:     ${createdSubnets.count}`)
  console.log(`   Total IPs created:   ${totalIps}`)
  console.log('\n✨ Seed completed successfully!')
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })
