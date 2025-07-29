// Admin panel JS

document.addEventListener('DOMContentLoaded', function() {
  // User list
  function loadUsers() {
    fetch('/api/admin/users', { credentials: 'include' })
      .then(r => r.json())
      .then(users => {
        const list = document.getElementById('userList');
        list.innerHTML = '';
        const bioMod = document.getElementById('bioModeration');
        bioMod.innerHTML = '';
        users.forEach(u => {
          const div = document.createElement('div');
          div.innerHTML = `
            <b>${u.username}</b> (ID: ${u.id}) - Glows: ${u.glows} - Created: ${new Date(u.createdAt).toLocaleString()}<br>
            Status: ${u.banned ? 'Banned' : 'Active'}
            <button class="banBtn">${u.banned ? 'Unban' : 'Ban'}</button>
            <input type="text" class="banReason" placeholder="Reason" style="display:${u.banned ? 'none':'inline-block'};width:120px;">
            <input type="number" class="banDuration" placeholder="Duration(s)" style="display:${u.banned ? 'none':'inline-block'};width:80px;">
            <hr>
          `;
          list.appendChild(div);
          const btn = div.querySelector('.banBtn');
          btn.onclick = function() {
            if (u.banned) {
              fetch('/api/admin/unban', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ id: u.id }) })
                .then(() => loadUsers());
            } else {
              const reason = div.querySelector('.banReason').value;
              const duration = parseInt(div.querySelector('.banDuration').value) || 0;
              fetch('/api/admin/ban', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ id: u.id, reason, duration }) })
                .then(() => loadUsers());
            }
          };

          // Bio moderation
          const bioDiv = document.createElement('div');
          bioDiv.innerHTML = `<b>${u.username}</b> (ID: ${u.id})<br>Bio: <input type="text" value="${u.bio || ''}" style="width:200px;"> <button class="saveBioBtn">Save</button> <button class="deleteBioBtn">Delete</button><hr>`;
          bioMod.appendChild(bioDiv);
          bioDiv.querySelector('.saveBioBtn').onclick = function() {
            const newBio = bioDiv.querySelector('input').value;
            fetch('/api/admin/set-bio', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ id: u.id, bio: newBio }) })
              .then(() => loadUsers());
          };
          bioDiv.querySelector('.deleteBioBtn').onclick = function() {
            fetch('/api/admin/set-bio', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ id: u.id, bio: '' }) })
              .then(() => loadUsers());
          };
        });
      });
  }
  // Redeem codes
  function loadCodes() {
    fetch('/api/admin/codes', { credentials: 'include' })
      .then(r => r.json())
      .then(codes => {
        const list = document.getElementById('codeList');
        list.innerHTML = codes.map(c => `<div>${c.code} - ${c.value} glows</div>`).join('');
      });
  }
  document.getElementById('regenCodesBtn').onclick = function() {
    fetch('/api/admin/regen-codes', { method: 'POST', credentials: 'include' })
      .then(() => loadCodes());
  };
  // Logs
  function loadLogs() {
    fetch('/api/admin/logs', { credentials: 'include' })
      .then(r => r.text())
      .then(logs => {
        document.getElementById('serverLogs').textContent = logs;
      });
  }
  // Only load if admin panel is visible
  if (document.getElementById('admin-panel').style.display === 'block') {
    loadUsers();
    loadCodes();
    loadLogs();
  }
});
