// Signup page JS
// Will handle form submission and send data to backend

document.getElementById('signupForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    // TODO: Add birthday, gender, profile image, etc.
    const res = await fetch('/api/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    document.getElementById('signupMessage').textContent = data.message || data.error;
    if (data.success) {
        setTimeout(() => window.location.href = 'login.html', 1000);
    }
});
