// Redeem page JS

document.getElementById('redeemForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    const code = document.getElementById('code').value;
    const res = await fetch('/api/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ code })
    });
    const data = await res.json();
    document.getElementById('redeemMessage').textContent = data.message || data.error;
});
