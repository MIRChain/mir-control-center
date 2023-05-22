const platform = process.platform === 'win32' ? 'windows' : process.platform

const findIpcPathInLogs = logs => {
  let ipcPath
  for (const logPart of logs) {
    const found = logPart.includes('IPC endpoint opened')
    if (found) {
      // On windows we can only use plain top-level pipes
      if (platform === 'windows') {
        ipcPath = logPart
          .split('=')[1]
          .replace('isMultitenant', '')
          .trim()
        return ipcPath
      } else {
        ipcPath = logPart
          .split('=')[1]
          .replace('isMultitenant', '')
          .trim()
        // fix double escaping
        if (ipcPath.includes('\\\\')) {
          ipcPath = ipcPath.replace(/\\\\/g, '\\')
        }
        console.log('Found IPC path: ', ipcPath)
        return ipcPath
      }
    }
  }
  console.log('IPC path not found in logs', logs)
  return null
}

module.exports = {
  type: 'client',
  order: 1,
  displayName: 'Mir',
  name: 'mir',
  // repository: 'https://gethstore.blob.core.windows.net', // https://gethstore.blob.core.windows.net/builds/geth-linux-amd64-1.11.6-ea9e62ca.tar.gz
  repository: 'https://github.com/MIRChain/MIR',
  modifiers: {
    version: ({ version }) =>
      version
        .split('-')
        .slice(0, -1)
        .join('-')
  },
  filter: {
    name: {
      includes: [platform],
      excludes: ['unstable', 'alltools', 'swarm', 'mips', 'arm']
    }
  },
  prefix: `mir-${platform}`,
  binaryName: process.platform === 'win32' ? 'mir.exe' : 'mir',
  resolveIpc: logs => findIpcPathInLogs(logs),
  settings: [
    {
      id: 'network',
      default: 'soyuz',
      label: 'Network',
      options: [
        {
          value: 'main',
          label: 'Mir (mainnet: gost, proof-of-work)',
          flag:
            '--crypto gost --mainnet.mir --ethstats UIUser:buran@194.87.253.126:3000'
        },
        {
          value: 'soyuz',
          label: 'Soyuz (testnet: gost, proof-of-work)',
          flag:
            '--crypto gost --soyuz --ethstats UIUser:soyuz@194.87.80.101:3000'
        },
        {
          value: 'maineth',
          label: 'Ethereum (mainnet: secp256k1, proof-of-work)',
          flag: '--crypto nist --mainnet.eth'
        },
        {
          value: 'rinkery',
          label: 'Rinkeby (testnet: secp256k1, proof-of-authority)',
          flag: '--crypto nist --rinkeby'
        },
        {
          value: 'custom',
          label: 'Custom network',
          flag: ''
        }
        // { value: 'goerli', label: 'Görli (testnet)', flag: '--goerli' },
        // { value: 'dev', label: 'Local (dev mode)', flag: '--dev' }
      ]
    },
    {
      id: 'networkId',
      label: 'Network ID',
      flag: '--networkid %s',
      default: '',
      ignoreIfEmpty: true
    },
    {
      id: 'cryptoType',
      default: 'gost',
      label: 'Crytography Type',
      options: [
        { value: 'gost', label: 'GOST' },
        { value: 'nist', label: 'NIST' }
      ],
      flag: '--crypto %s'
    },
    {
      id: 'syncMode',
      default: 'full',
      label: 'Sync Mode',
      options: [
        { value: 'fast', label: 'Fast' },
        { value: 'full', label: 'Full' }
      ],
      flag: '--syncmode %s'
    },
    {
      id: 'identity',
      label: 'Custom node name',
      flag: '--identity %s',
      default: 'Space_Monkey_1'
    },
    {
      id: 'dataDir',
      default: '',
      label: 'Data Directory',
      flag: '--datadir %s',
      type: 'directory',
      ignoreIfEmpty: true
    },
    {
      id: 'keystoreDir',
      default: '',
      label: 'Keystore Directory',
      flag: '--keystore %s',
      type: 'directory',
      ignoreIfEmpty: true
    },
    {
      id: 'rpc',
      default: 'none',
      label: 'HTTP RPC API',
      options: [
        { value: 'none', label: 'Disabled', flag: '' },
        {
          value: 'on',
          label: 'Enabled for All Origins (*)',
          flag: '--http --http.corsdomain=*'
        }
      ]
    },
    {
      id: 'ws',
      default: 'none',
      label: 'WebSockets API',
      options: [
        { value: 'none', label: 'Disabled', flag: '' },
        {
          value: 'on',
          label: 'Enabled for All Origins (*)',
          flag: '--ws --ws.origins=*'
        }
      ]
    },
    {
      id: 'port',
      label: 'P2P Port',
      flag: '--port %s',
      default: '30303'
    },

    {
      id: 'graphql',
      label: 'Enable GraphQL Server',
      default: 'false',
      options: [
        {
          value: 'true',
          flag: '--graphql --graphql.corsdomain=*',
          label: 'Yes, All Origins (*)'
        },
        { value: 'false', flag: '', label: 'No' }
      ]
    },
    {
      id: 'miner',
      label: 'Start mining',
      default: 'false',
      options: [
        {
          value: 'true',
          flag: '--mine',
          label: 'Yes'
        },
        { value: 'false', flag: '', label: 'No' }
      ]
    },
    {
      id: 'etherbase',
      label: 'Coinbase',
      default: '',
      flag: '--miner.etherbase %s',
      ignoreIfEmpty: true
    },
    {
      id: 'minerThreads',
      label: 'CPU threads for mining',
      default: 'none',
      options: [
        { value: '1', label: '1 Thread', flag: '--miner.threads=1' },
        { value: '2', label: '2 Threads', flag: '--miner.threads=2' },
        { value: '3', label: '3 Threads', flag: '--miner.threads=3' },
        { value: '4', label: '4 Threads', flag: '--miner.threads=4' },
        { value: '5', label: '5 Threads', flag: '--miner.threads=5' },
        { value: '6', label: '6 Threads', flag: '--miner.threads=6' },
        { value: '7', label: '7 Threads', flag: '--miner.threads=7' },
        { value: '8', label: '8 Threads', flag: '--miner.threads=8' },
        { value: '9', label: '9 Threads', flag: '--miner.threads=9' },
        { value: '10', label: '10 Threads', flag: '--miner.threads=10' },
        { value: '11', label: '11 Threads', flag: '--miner.threads=11' },
        { value: '12', label: '12 Threads', flag: '--miner.threads=12' },
        { value: 'none', label: 'none', flag: '' }
      ]
    },
    {
      id: 'bootnodes',
      label: 'Bootnodes',
      flag: '--bootnodes %s',
      default: '',
      ignoreIfEmpty: true
    },
    // {
    //   id: 'signer',
    //   label: 'Signer',
    //   default: 'none',
    //   options: [
    //     { value: 'none', flag: '', label: 'Internal' },
    //     {
    //       value: 'clef',
    //       flag: '--signer http://localhost:8550',
    //       label: 'Clef (default: localhost:8550)'
    //     }
    //   ]
    // },
    // {
    //   id: 'usb',
    //   label: 'Enable USB (hardware wallets)',
    //   default: 'false',
    //   options: [
    //     { value: 'false', flag: '--nousb', label: 'No' },
    //     { value: 'true', flag: '', label: 'Yes' }
    //   ]
    // },
    {
      id: 'verbosity',
      label: 'Verbosity',
      default: 3,
      options: [
        { value: 3, label: '3 = Info', flag: '--verbosity=3' }, // Mir's default
        { value: 4, label: '4 = Debug', flag: '--verbosity=4' },
        { value: 5, label: '5 = Detail', flag: '--verbosity=5' }
      ]
    }
    // {
    //   id: 'console',
    //   label: 'Enable Console',
    //   default: 'false',
    //   options: [
    //     { value: 'true', flag: 'console', label: 'Yes' },
    //     { value: 'false', flag: '', label: 'No' }
    //   ]
    // },
  ],
  about: {
    description:
      'Mir is an implementation of Quorum/Ethereum with Russian GOST cryptography',
    apps: [
      // {
      //   name: 'Block Explorer',
      //   url: 'package://github.com/marcgarreau/grid-blocks-app',
      //   dependencies: [
      //     {
      //       name: 'geth',
      //       settings: [{ id: 'graphql', value: 'true' }]
      //     }
      //   ]
      // },
      // {
      //   name: 'RPC Tester App',
      //   url: 'package://github.com/ryanio/grid-rpc-app',
      //   dependencies: [
      //     {
      //       name: 'geth',
      //       settings: []
      //     }
      //   ]
      // },
      {
        name: 'GraphQL App',
        url: 'http://localhost:8547'
      }
    ],
    links: [
      {
        name: 'GitHub Repository',
        url: 'https://github.com/MIRChain'
      }
    ],
    docs: [
      {
        name: 'Mir Docs',
        url: 'https://mirchain.github.io/MIR/'
      }
      // {
      //   name: 'Geth Changelog',
      //   url: 'https://github.com/ethereum/go-ethereum/releases'
      // },
      // {
      //   name: 'JSON RPC API Reference',
      //   url:
      //     'https://github.com/ethereum/wiki/wiki/JSON-RPC#json-rpc-api-reference'
      // }
    ]
    // community: [
    //   {
    //     name: 'Discord Chat',
    //     url: 'https://discordapp.com/invite/nthXNEv'
    //   }
    // ]
  }
}
