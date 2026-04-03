// Chat functionality
let currentConversation = null;
let currentUser = null;
let messageRefreshInterval = null;
let savedRange = null;

// API base URL
const API_URL = '/api/chat';

// Initialize chat on page load
document.addEventListener('DOMContentLoaded', async () => {
  try {
    // Get current user
    currentUser = await getMe();
    if (!currentUser) {
      window.location.href = 'login.html';
      return;
    }

    // Set user karma display
    document.getElementById('userKarmaDisplay').textContent = currentUser.karma || 0;

    // Load conversations
    loadConversations();

    // Set up rich message composer
    setupComposer();

    // Set up send button
    document.getElementById('sendBtn').addEventListener('click', sendMessage);
    document.getElementById('messageInput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });

    // Delete conversation
    const deleteBtn = document.getElementById('deleteConvBtn');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', deleteCurrentConversation);
    }

    // Handle conversation ID from URL params (if opening from a post)
    handleConversationFromQuery();
  } catch (error) {
    console.error('Error initializing chat:', error);
  }
});

// Load all conversations
async function loadConversations() {
  try {
    const response = await fetch(`${API_URL}/conversations`, {
      headers: getHeaders(),
    });

    if (!response.ok) {
      throw new Error('Failed to load conversations');
    }

    const conversations = await response.json();
    displayConversations(conversations);
  } catch (error) {
    console.error('Error loading conversations:', error);
    document.getElementById('conversationsList').innerHTML =
      '<div class="no-conversations">Failed to load conversations</div>';
  }
}

// Display conversations in sidebar
function displayConversations(conversations) {
  const conversationsList = document.getElementById('conversationsList');

  if (conversations.length === 0) {
    conversationsList.innerHTML =
      '<div class="no-conversations">No conversations yet. Start by offering help to someone nearby!</div>';
    return;
  }

  conversationsList.innerHTML = conversations
    .map((conv) => {
      // Get the other participant's name
      const otherParticipant = conv.participants.find(
        (p) => p._id !== currentUser._id
      );
      const participantName = otherParticipant ? otherParticipant.name : 'Unknown';

      const preview = stripHtml(conv.lastMessage || 'No messages yet');

      return `
        <div class="conversation-item ${
          currentConversation && currentConversation._id === conv._id
            ? 'active'
            : ''
        }" data-conv-id="${conv._id}" data-participant-name="${participantName.replace(/"/g, '&quot;')}" data-conv-data="${escapeHtml(JSON.stringify(conv))}">
          <div class="conversation-header">
            <div class="conversation-name">${participantName}</div>
            <div class="conversation-preview">${preview}</div>
          </div>
        </div>
      `;
    })
    .join('');

  // Add click event listeners
  document.querySelectorAll('.conversation-item').forEach((item) => {
    item.addEventListener('click', () => {
      const convId = item.getAttribute('data-conv-id');
      const participantName = item.getAttribute('data-participant-name');
      const convData = item.getAttribute('data-conv-data');
      
      // Unescape the HTML entities and parse the JSON
      const textarea = document.createElement('textarea');
      textarea.innerHTML = convData;
      const cleanData = textarea.value;
      selectConversation(convId, participantName, cleanData, item);
    });
  });
}

// Select a conversation
async function selectConversation(conversationId, participantName, conversationDataString, element) {
  try {
    currentConversation = JSON.parse(conversationDataString);
  } catch (e) {
    console.error('Error parsing conversation data:', e);
    return;
  }

  // Show chat panel
  document.getElementById('emptyState').style.display = 'none';
  document.getElementById('chatPanel').style.display = 'flex';
  document.getElementById('chatHeaderName').textContent = participantName;

  // Load messages
  await loadMessages();

  // Clear and update conversation items
  document.querySelectorAll('.conversation-item').forEach((item) => {
    item.classList.remove('active');
  });
  if (element) {
    element.classList.add('active');
  }

  // Set up message refresh interval
  if (messageRefreshInterval) {
    clearInterval(messageRefreshInterval);
  }
  messageRefreshInterval = setInterval(loadMessages, 2000); // Refresh every 2 seconds

  // Focus message input
  document.getElementById('messageInput').focus();
}

// Load messages for current conversation
async function loadMessages() {
  if (!currentConversation) return;

  try {
    const response = await fetch(`${API_URL}/messages/${currentConversation._id}`, {
      headers: getHeaders(),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Failed to load messages:', errorData);
      throw new Error(errorData.message || 'Failed to load messages');
    }

    const messages = await response.json();
    displayMessages(messages);
  } catch (error) {
    console.error('Error loading messages:', error);
  }
}

// Display messages in chat
function displayMessages(messages) {
  const messagesList = document.getElementById('messagesList');
  
  if (!messages || messages.length === 0) {
    messagesList.innerHTML = '<div style="text-align: center; color: var(--text-secondary); padding: 40px 20px;">No messages yet. Start the conversation!</div>';
    return;
  }
  
  messagesList.innerHTML = messages
    .map((msg) => {
      // Handle both populated and unpopulated senderId
      let senderId = msg.senderId;
      if (typeof senderId === 'object' && senderId._id) {
        senderId = senderId._id;
      }
      
      const isOwn = senderId === currentUser._id;
      const time = new Date(msg.createdAt).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
      });

      return `
        <div class="message-group ${isOwn ? 'sent' : 'received'}">
          <div class="message-content-wrap">
            <div class="message-bubble">${sanitizeMessageHtml(msg.content)}</div>
            <div class="message-time">${time}</div>
          </div>
        </div>
      `;
    })
    .join('');

  // Scroll to bottom
  messagesList.scrollTop = messagesList.scrollHeight;
}

// Send message
async function sendMessage() {
  if (!currentConversation) {
    console.warn('No conversation selected');
    return;
  }

  const messageInput = document.getElementById('messageInput');
  const content = getComposerHtml(messageInput);

  if (!content) return;

  try {
    const sendBtn = document.getElementById('sendBtn');
    sendBtn.disabled = true;

    const response = await fetch(`${API_URL}/messages`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({
        conversationId: currentConversation._id,
        content,
      }),
    });

    const responseData = await response.json();

    if (!response.ok) {
      console.error('Send failed:', responseData);
      showToast(responseData.message || 'Failed to send message', 'error');
      return;
    }

    // Clear input
    messageInput.innerHTML = '';

    // Reload messages immediately
    await loadMessages();

    // Reload conversations to update last message
    loadConversations();
    
    showToast('Message sent!', 'success');
  } catch (error) {
    console.error('Error sending message:', error);
    showToast('Failed to send message', 'error');
  } finally {
    document.getElementById('sendBtn').disabled = false;
  }
}

function setupComposer() {
  const editor = document.getElementById('messageInput');
  const emojiToggle = document.getElementById('emojiToggle');
  const emojiPanel = document.getElementById('emojiPanel');
  const imageUploadBtn = document.getElementById('imageUploadBtn');
  const imageInput = document.getElementById('imageInput');

  document.querySelectorAll('[data-cmd]').forEach((btn) => {
    btn.addEventListener('click', () => {
      editor.focus();
      restoreSelection(editor);
      document.execCommand(btn.getAttribute('data-cmd'), false);
      saveSelection(editor);
    });
  });

  emojiToggle.addEventListener('click', () => {
    emojiPanel.classList.toggle('show');
  });

  document.querySelectorAll('.emoji-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      insertTextAtCaret(btn.getAttribute('data-emoji') || '');
      editor.focus();
    });
  });

  imageUploadBtn.addEventListener('click', () => {
    imageInput.click();
  });

  imageInput.addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      showToast('Please select an image file', 'error');
      imageInput.value = '';
      return;
    }

    try {
      const dataUrl = await readFileAsDataUrl(file);
      insertHtmlAtCaret(`<img src="${escapeHtml(dataUrl)}" alt="Shared image">`);
      editor.focus();
    } catch (error) {
      console.error('Image read failed:', error);
      showToast('Could not add image', 'error');
    }

    imageInput.value = '';
  });

  editor.addEventListener('mouseup', () => saveSelection(editor));
  editor.addEventListener('keyup', () => saveSelection(editor));
  editor.addEventListener('focus', () => saveSelection(editor));
}

async function deleteCurrentConversation() {
  if (!currentConversation) return;

  if (!confirm('Are you sure you want to delete this conversation?')) return;

  try {
    const response = await fetch(
      `${API_URL}/conversations/${currentConversation._id}`,
      {
        method: 'DELETE',
        headers: getHeaders(),
      }
    );

    if (!response.ok) {
      throw new Error('Failed to delete conversation');
    }

    // Reset chat
    currentConversation = null;
    document.getElementById('emptyState').style.display = 'flex';
    document.getElementById('chatPanel').style.display = 'none';

    // Reload conversations
    loadConversations();

    // Clear refresh interval
    if (messageRefreshInterval) {
      clearInterval(messageRefreshInterval);
    }
  } catch (error) {
    console.error('Error deleting conversation:', error);
    alert('Failed to delete conversation');
  }
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return String(text).replace(/[&<>"']/g, (m) => map[m]);
}

function stripHtml(input) {
  const temp = document.createElement('div');
  temp.innerHTML = input || '';
  return (temp.textContent || temp.innerText || '').trim();
}

function sanitizeMessageHtml(input) {
  const container = document.createElement('div');
  container.innerHTML = input || '';

  const allowedTags = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'BR', 'IMG']);

  const cleanNode = (node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      return escapeHtml(node.textContent || '');
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
      return '';
    }

    const tag = node.tagName;
    const children = Array.from(node.childNodes).map(cleanNode).join('');

    if (!allowedTags.has(tag)) {
      return children;
    }

    if (tag === 'BR') {
      return '<br>';
    }

    if (tag === 'IMG') {
      const src = node.getAttribute('src') || '';
      const isAllowedSrc = src.startsWith('data:image/') || /^https?:\/\//i.test(src);
      if (!isAllowedSrc) return '';
      return `<img src="${escapeHtml(src)}" alt="Shared image">`;
    }

    const tagName = tag.toLowerCase();
    return `<${tagName}>${children}</${tagName}>`;
  };

  return Array.from(container.childNodes).map(cleanNode).join('');
}

function getComposerHtml(editor) {
  const html = editor.innerHTML || '';
  const text = stripHtml(html);
  const hasImage = /<img\b/i.test(html);

  if (!text && !hasImage) {
    return '';
  }

  return sanitizeMessageHtml(html);
}

function saveSelection(editor) {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return;

  const range = selection.getRangeAt(0);
  if (editor.contains(range.commonAncestorContainer)) {
    savedRange = range.cloneRange();
  }
}

function restoreSelection(editor) {
  const selection = window.getSelection();
  if (!selection) return;

  selection.removeAllRanges();
  if (savedRange && editor.contains(savedRange.commonAncestorContainer)) {
    selection.addRange(savedRange);
    return;
  }

  const range = document.createRange();
  range.selectNodeContents(editor);
  range.collapse(false);
  selection.addRange(range);
}

function insertTextAtCaret(text) {
  const editor = document.getElementById('messageInput');
  editor.focus();
  restoreSelection(editor);
  document.execCommand('insertText', false, text);
  saveSelection(editor);
}

function insertHtmlAtCaret(html) {
  const editor = document.getElementById('messageInput');
  editor.focus();
  restoreSelection(editor);
  document.execCommand('insertHTML', false, html);
  saveSelection(editor);
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Start a new conversation with a user
async function startConversationWithUser(otherUserId) {
  try {
    const response = await fetch(`${API_URL}/conversations`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({
        otherUserId,
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to create conversation');
    }

    const conversation = await response.json();

    // Redirect to chat and select conversation
    window.location.href = `chat.html?conversationId=${conversation._id}`;
  } catch (error) {
    console.error('Error starting conversation:', error);
    alert('Failed to start conversation');
  }
}

// Handle conversation ID from URL params (if opening from a post)
function handleConversationFromQuery() {
  const urlParams = new URLSearchParams(window.location.search);
  const conversationId = urlParams.get('conversationId');

  if (conversationId) {
    // Load conversations and then select the one from the URL
    const checkInterval = setInterval(() => {
      const conversations = document.querySelectorAll('.conversation-item');
      const targetConv = Array.from(conversations).find((item) =>
        item.getAttribute('data-conv-id') === conversationId
      );

      if (targetConv) {
        clearInterval(checkInterval);
        targetConv.click();
      }
    }, 100);

    setTimeout(() => clearInterval(checkInterval), 5000); // Timeout after 5 seconds
  }
}
