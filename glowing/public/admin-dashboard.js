// Admin dashboard JS

document.addEventListener('DOMContentLoaded', async function() {
    const res = await fetch('/api/admin/analytics', { credentials: 'include' });
    const data = await res.json();
    // Logins chart
    new Chart(document.getElementById('loginsChart').getContext('2d'), {
        type: 'line',
        data: {
            labels: data.dates,
            datasets: [{ label: 'Logins', data: data.logins, borderColor: '#00bfff', fill: false }]
        }
    });
    // Signups chart
    new Chart(document.getElementById('signupsChart').getContext('2d'), {
        type: 'line',
        data: {
            labels: data.dates,
            datasets: [{ label: 'Signups', data: data.signups, borderColor: '#4caf50', fill: false }]
        }
    });
    // Redeems chart
    new Chart(document.getElementById('redeemsChart').getContext('2d'), {
        type: 'line',
        data: {
            labels: data.dates,
            datasets: [{ label: 'Redeems', data: data.redeems, borderColor: '#ff9800', fill: false }]
        }
    });
});
