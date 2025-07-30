// Leaderboard page JS

document.addEventListener('DOMContentLoaded', async function() {
    const res = await fetch('/api/leaderboard');
    const data = await res.json();
    const tbody = document.querySelector('#leaderboardTable tbody');
    tbody.innerHTML = '';
    data.forEach((user, i) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${i+1}</td><td>${user.username}</td><td>${user.glows}</td><td>${user.achievements.join(', ')}</td>`;
        tbody.appendChild(tr);
    });
});
