// Call this from your browser console or add to your JS file
fetch('/api/vpn-check')
  .then(res => res.json())
  .then(data => {
    if (data.proxy || data.hosting) {
      alert('VPN or proxy detected! Some features may be restricted.');
    } else {
      console.log('No VPN/proxy detected:', data);
    }
  })
  .catch(err => console.error('VPN check failed:', err));
