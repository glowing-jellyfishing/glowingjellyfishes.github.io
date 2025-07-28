// Login page JS
// Will handle form submission and send data to backend

document.getElementById('loginForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    document.getElementById('loginMessage').textContent = data.message || data.error;
    if (data.success) {
        setTimeout(() => window.location.href = 'profile.html', 1000);
    }
});
