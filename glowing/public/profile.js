// Profile page JS
// Fetch and display user profile info

document.addEventListener('DOMContentLoaded', async function() {
    document.getElementById('profileInvite').textContent = data.inviteCode || '';
    document.getElementById('profileReferrals').textContent = data.referrals || 0;
    const res = await fetch('/api/profile', { credentials: 'include' });
    const data = await res.json();
    if (!data.success) {
        window.location.href = 'login.html';
        return;
    }
    document.getElementById('profileUsername').textContent = data.username;
    document.getElementById('profileBio').textContent = data.bio || '';
    document.getElementById('profileGlows').textContent = data.glows;
    document.getElementById('profileStars').textContent = data.stars || 0;
    document.getElementById('profileFollowers').textContent = data.followers;
    document.getElementById('profileAvatar').src = data.avatar || 'default-avatar.png';
    document.getElementById('buyStarsBtn').onclick = async function() {
        const res = await fetch('/api/buy-stars', { method: 'POST', credentials: 'include' });
        const d = await res.json();
        document.getElementById('profileStars').textContent = d.stars;
        document.getElementById('profileMessage').textContent = d.message || d.error;
    };
    if (data.createdAt) {
        document.getElementById('profileCreated').textContent = 'Account created: ' + new Date(data.createdAt).toLocaleString();
    }
    if (data.isOwner) {
        document.getElementById('logoutBtn').style.display = 'inline-block';
        document.getElementById('profileBio').contentEditable = true;
        document.getElementById('profileBio').addEventListener('blur', async function() {
            const bio = this.textContent;
            await fetch('/api/profile/bio', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ bio })
            });
        });
        document.getElementById('logoutBtn').onclick = async function() {
            await fetch('/api/logout', { method: 'POST', credentials: 'include' });
            window.location.href = 'login.html';
        };
    }
    document.getElementById('followBtn').onclick = async function() {
        const res = await fetch('/api/follow', { method: 'POST', credentials: 'include' });
        const d = await res.json();
        document.getElementById('profileMessage').textContent = d.message || d.error;
    };
    document.getElementById('reportBtn').onclick = function() {
        window.location.href = 'reporting-guidelines.html';
    };
});
