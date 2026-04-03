let currentTaskId = null;
let currentTask = null;
let currentUser = null;
let conversationId = null;
let messageRefreshInterval = null;
let lastMessagesRenderKey = '';
let selectedRatingValue = 0;

// Initialize page
async function initPage() {
    const params = new URLSearchParams(window.location.search);
    currentTaskId = params.get('id');

    if (!currentTaskId) {
        showToast('Task ID not provided', 'error');
        setTimeout(() => window.location.href = 'index.html', 2000);
        return;
    }

    try {
        // Load current user
        const userRes = await fetch(`${API_BASE_URL}/auth/me`, {
            headers: getHeaders()
        });
        if (!userRes.ok) {
            window.location.href = 'login.html';
            return;
        }
        currentUser = await userRes.json();
        document.getElementById('userInitial').textContent = currentUser.name.charAt(0).toUpperCase();

        // Load task details
        await loadTaskDetails();

        // Theme toggle
        setupThemeToggle();
    } catch (err) {
        console.error('Error initializing page:', err);
        showToast('Error loading page', 'error');
    }
}

async function loadTaskDetails() {
    try {
        const res = await fetch(`${API_BASE_URL}/posts/${currentTaskId}`, {
            headers: getHeaders()
        });

        if (!res.ok) {
            showToast('Task not found', 'error');
            setTimeout(() => window.location.href = 'index.html', 2000);
            return;
        }

        currentTask = await res.json();
        displayTaskDetails();
        updateUIBasedOnStatus();
    } catch (err) {
        console.error('Error loading task:', err);
        showToast('Error loading task details', 'error');
    }
}

function displayTaskDetails() {
    // Title and category
    document.getElementById('taskTitle').textContent = currentTask.title;
    
    const categoryEl = document.getElementById('taskCategory');
    categoryEl.textContent = currentTask.category;
    if (currentTask.isUrgent) {
        categoryEl.classList.add('urgent');
    }

    // Description
    document.getElementById('taskDescription').textContent = currentTask.description;

    // Meta information
    document.getElementById('metaCategory').textContent = currentTask.category;
    document.getElementById('metaUrgency').textContent = currentTask.isUrgent ? 'Urgent' : 'Normal';
    document.getElementById('metaPosted').textContent = new Date(currentTask.createdAt).toLocaleDateString();

    // Author information
    const author = currentTask.author;
    const totalRequests = Number(author.totalRequestsCreated || 0);
    const closedRequests = Number(author.totalRequestsClosed || 0);
    const completionRate = totalRequests > 0 ? Math.round((closedRequests / totalRequests) * 100) : 0;
    document.getElementById('authorName').textContent = author.name;
    document.getElementById('authorKarma').textContent = `Karma: ${author.karma}`;
    document.getElementById('authorRating').textContent = `Rating: ${Number(author.ratingAverage || 0).toFixed(1)} (${author.ratingCount || 0})`;
    document.getElementById('authorTrust').textContent = `Trust: ${completionRate}% complete • ${Number(author.avgResponseMinutes || 0).toFixed(1)}m response`;
    document.getElementById('authorAvatar').textContent = author.name.charAt(0).toUpperCase();

    // Price information
    if (currentTask.price > 0) {
        document.getElementById('metaPrice').textContent = `₹${currentTask.price}`;
    } else {
        document.getElementById('metaPrice').textContent = 'Free';
    }

    // Status display
    const statusEl = document.getElementById('taskStatus');
    if (currentTask.paymentStatus === 'paid') {
        statusEl.className = 'task-status paid';
        statusEl.textContent = '✅ Task Paid & Completed';
    } else if (currentTask.paymentStatus === 'escrowed') {
        statusEl.className = 'task-status locked';
        statusEl.textContent = '💰 Escrow Locked - In Progress';
    } else if (currentTask.isLocked) {
        statusEl.className = 'task-status locked';
        statusEl.textContent = '🔒 Task Locked - In Progress';
    } else {
        statusEl.className = 'task-status open';
        statusEl.textContent = '📋 Open - Seeking Help';
    }
}

function updateUIBasedOnStatus() {
    const acceptBtn = document.getElementById('acceptBtn');
    const markDoneBtn = document.getElementById('markDoneBtn');
    const rejectDoneBtn = document.getElementById('rejectDoneBtn');
    const invoiceBtn = document.getElementById('invoiceBtn');
    const rateBtn = document.getElementById('rateBtn');
    const chatHeader = document.getElementById('chatHeader');
    const messagesList = document.getElementById('messagesList');
    const messageForm = document.getElementById('messageForm');
    const chatPlaceholder = document.getElementById('chatPlaceholder');
    const taskLockedMsg = document.getElementById('taskLockedMsg');

    // Reset transient UI state before recalculating visibility.
    taskLockedMsg.style.display = 'none';
    acceptBtn.style.display = 'none';
    markDoneBtn.style.display = 'none';
    rejectDoneBtn.style.display = 'none';
    invoiceBtn.style.display = 'none';
    rateBtn.style.display = 'none';

    // Check if current user is the task author
    const isAuthor = currentUser._id === currentTask.author._id;

    // Check if task is accepted
    const isAccepted = currentTask.isLocked && currentTask.acceptedBy;

    if (isAuthor) {
        // This is the task author
        if (isAccepted) {
               const acceptedOffer = getAcceptedOfferForCurrentTask();
            const confirmedOffer = getConfirmedAcceptedOffer();
            if (confirmedOffer) {
                if (currentTask.paymentStatus === 'paid') {
                    invoiceBtn.style.display = 'block';
                    invoiceBtn.onclick = () => window.open(`/api/community/invoices/${currentTask.invoiceId}`, '_blank');
                } else if (currentTask.price > 0) {
                    taskLockedMsg.textContent = 'Payment release is being processed from escrow.';
                    taskLockedMsg.style.display = 'block';
                }

                if (!confirmedOffer.ratingByRequester) {
                    rateBtn.style.display = 'block';
                    rateBtn.onclick = submitRating;
                }
                } else if (acceptedOffer && (acceptedOffer.completionStatus || 'in_progress') === 'marked_done') {
                    taskLockedMsg.textContent = `${currentTask.acceptedBy.name} marked this task as done. Confirm to release payment${Number(currentTask.price || 0) > 0 ? ` (₹${Number(currentTask.price).toFixed(2)})` : ''}.`;
                    taskLockedMsg.style.display = 'block';

                    markDoneBtn.style.display = 'block';
                    markDoneBtn.textContent = 'Confirm Task as Done';
                    markDoneBtn.onclick = () => confirmTaskDone(acceptedOffer._id, true);

                    rejectDoneBtn.style.display = 'block';
                    rejectDoneBtn.textContent = 'Reject and Ask Rework';
                    rejectDoneBtn.onclick = () => confirmTaskDone(acceptedOffer._id, false);
            } else {
                if (currentTask.price > 0) {
                    taskLockedMsg.textContent = `This task has been accepted by ${currentTask.acceptedBy.name}. ₹${Number(currentTask.price).toFixed(2)} is locked in escrow.`;
                } else {
                    taskLockedMsg.textContent = `This task has been accepted by ${currentTask.acceptedBy.name}. Once they mark it as done, you can confirm or reject the work.`;
                }
                taskLockedMsg.style.display = 'block';
            }
            loadConversationWithHelper();
            showChatInterface();
        }
    } else {
        // This is not the task author
        if (isAccepted) {
            if (currentTask.acceptedBy._id === currentUser._id) {
                const acceptedOffer = currentTask.offers.find((offer) => {
                    const offerUserId = offer.user && offer.user._id ? offer.user._id : offer.user;
                    return offer.status === 'accepted' && String(offerUserId) === String(currentUser._id);
                });

                if (acceptedOffer) {
                    const completionStatus = acceptedOffer.completionStatus || 'in_progress';
                    if (completionStatus === 'in_progress' || completionStatus === 'rejected_done') {
                        markDoneBtn.style.display = 'block';
                        markDoneBtn.textContent = completionStatus === 'rejected_done' ? 'Mark Task as Done Again' : 'Mark Task as Done';
                        markDoneBtn.onclick = () => markTaskDone(acceptedOffer._id);
                    }
                }

                const confirmedOffer = getConfirmedAcceptedOffer();
                if (confirmedOffer) {
                    if (currentTask.paymentStatus === 'paid') {
                        invoiceBtn.style.display = 'block';
                        invoiceBtn.onclick = () => window.open(`/api/community/invoices/${currentTask.invoiceId}`, '_blank');
                        if (currentTask.price > 0) {
                            taskLockedMsg.style.display = 'block';
                            taskLockedMsg.textContent = `You received ₹${Number(currentTask.price).toFixed(2)} in wallet.`;
                        }
                    }

                    if (!confirmedOffer.ratingByHelper) {
                        rateBtn.style.display = 'block';
                        rateBtn.onclick = submitRating;
                    }
                }
                loadConversationWithAuthor();
                showChatInterface();
            } else {
                taskLockedMsg.style.display = 'block';
                if (currentTask.price > 0) {
                    taskLockedMsg.textContent = `This task has been accepted by ${currentTask.acceptedBy.name}. Reward: ₹${Number(currentTask.price).toFixed(2)}.`;
                } else {
                    taskLockedMsg.textContent = `This task has been accepted by ${currentTask.acceptedBy.name}.`;
                }
            }
        } else {
            acceptBtn.textContent = currentTask.price > 0 ? `Accept Task • Earn ₹${Number(currentTask.price).toFixed(2)}` : 'Accept Task';
            acceptBtn.style.display = 'block';
            acceptBtn.onclick = acceptTask;
        }
    }
}

function showOfferModal() {
    const offerMessage = prompt('Send a message to the task requester (optional):', 'I can help with this!');
    if (offerMessage !== null) {
        submitOffer(offerMessage);
    }
}

async function submitOffer(message) {
    try {
        const res = await fetch(`${API_BASE_URL}/posts/${currentTaskId}/offer`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ message: message || '' })
        });

        const data = await res.json();

        if (!res.ok) {
            showToast(data.message || 'Failed to offer help', 'error');
            return;
        }

        showToast('Help offered! You can now accept the task.', 'success');
        
        // Reload task
        await loadTaskDetails();
    } catch (err) {
        console.error('Error offering help:', err);
        showToast('Error offering help', 'error');
    }
}

async function acceptTask() {
    try {
        let liveLocation = null;

        try {
            liveLocation = await getCurrentLocation({ enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 });
        } catch (locationErr) {
            // Fallback to stored profile location on backend if browser location is unavailable.
            console.warn('Live location unavailable during accept; falling back to profile location.', locationErr);
        }

        const res = await fetch(`${API_BASE_URL}/posts/${currentTaskId}/accept-self`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify(
                liveLocation
                    ? { lat: liveLocation.lat, lng: liveLocation.lng }
                    : {}
            )
        });

        const data = await res.json();

        if (!res.ok) {
            showToast(data.message || 'Failed to accept task', 'error');
            return;
        }

        showToast('Task accepted! You can now chat with the requester.', 'success');
        
        // Reload task
        await loadTaskDetails();
    } catch (err) {
        console.error('Error accepting task:', err);
        showToast('Error accepting task', 'error');
    }
}

async function loadConversationWithHelper() {
    // Get or create conversation with the helper (acceptedBy user)
    const helperId = currentTask.acceptedBy._id;
    
    try {
        const res = await fetch(`${API_BASE_URL}/chat/conversations`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ otherUserId: helperId })
        });

        if (!res.ok) {
            showToast('Failed to load conversation', 'error');
            return;
        }

        const conversation = await res.json();
        conversationId = conversation._id;
        loadMessages();
        startMessageRefresh();
    } catch (err) {
        console.error('Error loading conversation:', err);
        showToast('Error loading chat', 'error');
    }
}

async function loadConversationWithAuthor() {
    // Get or create conversation with the task author
    const authorId = currentTask.author._id;
    
    try {
        const res = await fetch(`${API_BASE_URL}/chat/conversations`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ otherUserId: authorId })
        });

        if (!res.ok) {
            showToast('Failed to load conversation', 'error');
            return;
        }

        const conversation = await res.json();
        conversationId = conversation._id;
        loadMessages();
        startMessageRefresh();
    } catch (err) {
        console.error('Error loading conversation:', err);
        showToast('Error loading chat', 'error');
    }
}

async function loadMessages() {
    if (!conversationId) return;

    try {
        const res = await fetch(`${API_BASE_URL}/chat/messages/${conversationId}`, {
            headers: getHeaders()
        });

        if (!res.ok) {
            if (res.status === 404) {
                document.getElementById('messagesList').innerHTML = '';
                return;
            }
            throw new Error('Failed to load messages');
        }

        const messages = await res.json();
        const nextKey = messages.map((msg) => `${msg._id}:${msg.updatedAt || msg.createdAt}`).join('|');

        // Avoid repainting identical message lists every poll cycle.
        if (nextKey === lastMessagesRenderKey) {
            return;
        }

        lastMessagesRenderKey = nextKey;
        displayMessages(messages);
    } catch (err) {
        console.error('Error loading messages:', err);
    }
}

function displayMessages(messages) {
    const messagesList = document.getElementById('messagesList');
    const wasNearBottom =
        messagesList.scrollHeight - messagesList.scrollTop - messagesList.clientHeight < 40;
    messagesList.innerHTML = '';

    messages.forEach(msg => {
        const senderId = msg.senderId && msg.senderId._id ? msg.senderId._id : msg.senderId;
        const isSent = senderId === currentUser._id;
        const messageGroup = document.createElement('div');
        messageGroup.className = `message-group ${isSent ? 'sent' : 'received'}`;

        if (!isSent) {
            const avatar = document.createElement('div');
            avatar.className = 'message-avatar';
            avatar.textContent = msg.senderName.charAt(0).toUpperCase();
            messageGroup.appendChild(avatar);
        }

        const bubble = document.createElement('div');
        bubble.className = 'message-bubble';
        bubble.textContent = msg.content;
        messageGroup.appendChild(bubble);

        if (isSent && !messageGroup.querySelector('.message-avatar')) {
            const time = document.createElement('div');
            time.className = 'message-time';
            time.textContent = new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const wrapper = document.createElement('div');
            wrapper.style.display = 'flex';
            wrapper.style.justifyContent = 'flex-end';
            wrapper.appendChild(time);
            messagesList.appendChild(wrapper);
        }

        messagesList.appendChild(messageGroup);
    });

    // Keep auto-scroll behavior only when user is already near the bottom.
    if (wasNearBottom) {
        messagesList.scrollTop = messagesList.scrollHeight;
    }
}

async function markTaskDone(offerId) {

    function getAcceptedOfferForCurrentTask() {
        if (!currentTask || !Array.isArray(currentTask.offers)) return null;

        const acceptedById = currentTask.acceptedBy && currentTask.acceptedBy._id
            ? currentTask.acceptedBy._id
            : currentTask.acceptedBy;

        return currentTask.offers.find((offer) => {
            if (offer.status !== 'accepted') return false;
            const offerUserId = offer.user && offer.user._id ? offer.user._id : offer.user;
            if (!acceptedById || !offerUserId) return true;
            return String(offerUserId) === String(acceptedById);
        }) || null;
    }

    async function confirmTaskDone(offerId, isDone) {
        try {
            const res = await fetch(`${API_BASE_URL}/posts/${currentTaskId}/confirm/${offerId}`, {
                method: 'POST',
                headers: getHeaders(),
                body: JSON.stringify({ isDone: Boolean(isDone) })
            });

            const data = await res.json();

            if (!res.ok) {
                showToast(data.message || 'Could not update completion status', 'error');
                return;
            }

            showToast(
                data.message || (isDone ? 'Task confirmed. Payment released to helper.' : 'Completion rejected. Helper notified.'),
                'success'
            );

            await loadTaskDetails();
        } catch (err) {
            console.error('Error confirming task completion:', err);
            showToast('Server error', 'error');
        }
    }
    try {
        const res = await fetch(`${API_BASE_URL}/posts/${currentTaskId}/done/${offerId}`, {
            method: 'POST',
            headers: getHeaders()
        });

        const data = await res.json();

        if (!res.ok) {
            showToast(data.message || 'Could not mark done', 'error');
            return;
        }

        showToast(data.message || 'Marked as done. Waiting for confirmation.', 'success');
        await loadTaskDetails();
    } catch (err) {
        console.error('Error marking task done:', err);
        showToast('Server error', 'error');
    }
}

function getConfirmedAcceptedOffer() {
    if (!currentTask || !Array.isArray(currentTask.offers)) return null;

    return currentTask.offers.find((offer) => {
        return offer.status === 'accepted' && offer.completionStatus === 'confirmed_done';
    }) || null;
}

async function submitRating() {
    selectedRatingValue = 0;
    renderRatingStars(0);
    document.getElementById('ratingHint').textContent = 'Select a rating';
    document.getElementById('ratingModal').classList.remove('hidden');
}

function closeRatingModal() {
    document.getElementById('ratingModal').classList.add('hidden');
    selectedRatingValue = 0;
}

function renderRatingStars(activeValue) {
    const starsEl = document.getElementById('ratingStars');
    starsEl.innerHTML = [1, 2, 3, 4, 5].map((value) => {
        const active = value <= activeValue ? 'active' : '';
        return `<button type="button" class="rating-star ${active}" onclick="selectRatingValue(${value})">★</button>`;
    }).join('');
}

function selectRatingValue(value) {
    selectedRatingValue = value;
    renderRatingStars(value);
    document.getElementById('ratingHint').textContent = `${value}/5 selected`;
}

async function submitRatingFromModal() {
    if (!Number.isInteger(selectedRatingValue) || selectedRatingValue < 1 || selectedRatingValue > 5) {
        showToast('Please choose a rating from 1 to 5', 'error');
        return;
    }

    try {
        const res = await fetch(`${API_BASE_URL}/posts/${currentTaskId}/rate`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ rating: selectedRatingValue })
        });

        const data = await res.json();

        if (!res.ok) {
            showToast(data.message || 'Failed to submit rating', 'error');
            return;
        }

        showToast(data.message || 'Rating submitted', 'success');
        closeRatingModal();
        await loadTaskDetails();
    } catch (err) {
        console.error('Error submitting rating:', err);
        showToast('Error submitting rating', 'error');
    }
}

async function sendMessage(event) {
    event.preventDefault();

    const input = document.getElementById('messageInput');
    const content = input.value.trim();

    if (!content) return;

    try {
        const res = await fetch(`${API_BASE_URL}/chat/messages`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({
                conversationId,
                content
            })
        });

        if (!res.ok) {
            const data = await res.json();
            showToast(data.message || 'Failed to send message', 'error');
            return;
        }

        input.value = '';
        await loadMessages();
    } catch (err) {
        console.error('Error sending message:', err);
        showToast('Error sending message', 'error');
    }
}

function showChatInterface() {
    document.getElementById('chatHeader').style.display = 'block';
    document.getElementById('messagesList').style.display = 'flex';
    document.getElementById('messageForm').style.display = 'flex';
    document.getElementById('chatPlaceholder').style.display = 'none';
}

function startMessageRefresh() {
    if (messageRefreshInterval) clearInterval(messageRefreshInterval);
    messageRefreshInterval = setInterval(loadMessages, 4000);
}

function stopMessageRefresh() {
    if (messageRefreshInterval) {
        clearInterval(messageRefreshInterval);
        messageRefreshInterval = null;
    }
}

// Theme toggle
function setupThemeToggle() {
    const themeToggle = document.getElementById('themeToggle');
    const html = document.documentElement;

    const currentTheme = localStorage.getItem('theme') || 'light';
    if (currentTheme === 'dark') {
        html.classList.add('dark');
    }

    themeToggle.addEventListener('click', () => {
        if (html.classList.contains('dark')) {
            html.classList.remove('dark');
            localStorage.setItem('theme', 'light');
        } else {
            html.classList.add('dark');
            localStorage.setItem('theme', 'dark');
        }
    });
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', initPage);

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    stopMessageRefresh();
});
