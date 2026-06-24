const { Fritzbox } = require('fritzbox');

async function test() {
  const fb = new Fritzbox({
    host: 'fritz.box',
    port: 49000,
    ssl: false,
    user: 'ai_automation',
    password: 'ai_automation123',
  });
  
  await fb.initTR064Device();
  const hf = fb.services['urn:dslforum-org:service:X_AVM-DE_HostFilter:1'];
  const hostsService = fb.services['urn:dslforum-org:service:Hosts:1'];
  
  const num = await hostsService.actions.GetHostNumberOfEntries();
  console.log('Total hosts:', num?.NewHostNumberOfEntries);
  
  // Check only first 30 hosts
  for (let i = 0; i < Math.min(30, num?.NewHostNumberOfEntries || 0); i++) {
    try {
      const host = await hostsService.actions.GetGenericHostEntry({ NewIndex: i });
      if (host.NewIPAddress) {
        const filterInfo = await hf.actions.GetHostEntryByIP({ NewIPv4Address: host.NewIPAddress });
        console.log(`${host.NewIPAddress.padEnd(16)} ${(host.NewHostName || '?').padEnd(22)} Profile: ${(filterInfo.NewFilterProfileID || '-').padEnd(15)} WAN: ${filterInfo.NewWANAccess || '?'}`);
      }
    } catch(e) {
      // skip
    }
  }
  
  // Check the Jake profile details
  console.log('\n=== Jake Profile details ===');
  // Try to find device on profile filtprof7528
  const allHosts = [];
  for (let i = 0; i < Math.min(30, num?.NewHostNumberOfEntries || 0); i++) {
    try {
      const host = await hostsService.actions.GetGenericHostEntry({ NewIndex: i });
      if (host.NewIPAddress) {
        allHosts.push(host);
      }
    } catch(e) {}
  }
  
  // For each host, try AddTicketTimeToHostEntryByIP on Jake's device(s)
  for (const host of allHosts) {
    try {
      const filterInfo = await hf.actions.GetHostEntryByIP({ NewIPv4Address: host.NewIPAddress });
      if (filterInfo.NewFilterProfileID === 'filtprof7528' || filterInfo.NewFilterProfileID === 'filtprof693') {
        console.log(`\nDevice on Jake profile:`, host.NewHostName, host.NewIPAddress);
        console.log('Filter info:', JSON.stringify(filterInfo, null, 2));
        
        // Try adding ticket time
        try {
          const result = await hf.actions.AddTicketTimeToHostEntryByIP({
            NewIPv4Address: host.NewIPAddress,
            NewMinutes: 15,
          });
          console.log('Ticket added:', JSON.stringify(result));
        } catch(e2) {
          console.log('Ticket add error:', e2.message || 'Unknown error');
        }
      }
    } catch(e) {}
  }
}

test().catch(e => console.error('Error:', e.message));
