// Signup page JS
// Will handle form submission and send data to backend

document.getElementById('signupForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    const form = document.getElementById('signupForm');
    const formData = new FormData(form);
    // Get CSRF token from cookie
    function getCookie(name) {
        const value = `; ${document.cookie}`;
        const parts = value.split(`; ${name}=`);
        if (parts.length === 2) return parts.pop().split(';').shift();
    }
    const csrfToken = getCookie('_csrf');
    const res = await fetch('/api/signup', {
        method: 'POST',
        headers: csrfToken ? { 'X-CSRF-Token': csrfToken } : {},
        body: formData
    });
    let data;
    try {
        data = await res.json();
    } catch {
        document.getElementById('signupMessage').textContent = 'Signup failed. Please try again.';
        return;
    }
    document.getElementById('signupMessage').textContent = data.message || data.error;
    if (data.success) {
        setTimeout(() => window.location.href = 'login.html', 1000);
    }
});
