// Discord-like Glow Chat
// Discord-like Glow Chat
const chatMessages = document.getElementById('chatMessages');
const chatForm = document.getElementById('chatForm');
const chatInput = document.getElementById('chatInput');
let currentChannel = 'general';
let channels = [];

async function fetchChannels() {
    const res = await fetch('/glow-chat/channels.json');
    channels = await res.json();
    renderChannels();
}

function renderChannels() {
    const channelList = document.getElementById('channelList');
    channelList.innerHTML = '';
    channels.forEach(channel => {
        const div = document.createElement('div');
        div.className = 'channel-item' + (channel.id === currentChannel ? ' active' : '');
        div.textContent = `#${channel.name}`;
        div.onclick = () => {
            currentChannel = channel.id;
            renderChannels();
            loadMessages();
        };
        channelList.appendChild(div);
    });
}

async function loadMessages() {
    chatMessages.innerHTML = '<div>Loading...</div>';
    const res = await fetch(`/api/chat/messages?channel=${encodeURIComponent(currentChannel)}`);
    const messages = await res.json();
    chatMessages.innerHTML = '';
    messages.forEach(renderMessage);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function renderMessage(msg) {
    const div = document.createElement('div');
    div.className = 'chat-message';
    const avatar = document.createElement('img');
    avatar.className = 'chat-avatar';
    avatar.src = msg.avatar || '/glowing/avatars/default-avatar.png';
    avatar.alt = 'avatar';
    const content = document.createElement('div');
    content.className = 'chat-content';
    // Username and timestamp row
    const metaRow = document.createElement('div');
    metaRow.style.display = 'flex';
    metaRow.style.alignItems = 'center';
    const username = document.createElement('span');
    username.className = 'chat-username';
    username.textContent = msg.username || 'Anonymous';
    const timestamp = document.createElement('span');
    timestamp.className = 'chat-timestamp';
    timestamp.textContent = msg.timestamp ? dayjs(msg.timestamp).format('YYYY-MM-DD HH:mm') : '';
    metaRow.appendChild(username);
    metaRow.appendChild(timestamp);
    content.appendChild(metaRow);
    // Markdown rendering
    const md = document.createElement('div');
    md.innerHTML = marked.parse(msg.text || '');
    content.appendChild(md);
    div.appendChild(avatar);
    div.appendChild(content);
    chatMessages.appendChild(div);
}

chatForm.onsubmit = async e => {
    e.preventDefault();
    const text = chatInput.value.trim();
    if (!text) return;
    await fetch('/api/chat/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel: currentChannel, text })
    });
    chatInput.value = '';
    loadMessages();
};

fetchChannels();
loadMessages();
setInterval(loadMessages, 3000);
