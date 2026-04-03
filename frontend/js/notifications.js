const NOTIFICATION_API = '/api/notifications';
let notificationRefreshTimer = null;
let notificationCurrentUserId = null;
let notificationRatingPostId = null;
let notificationSelectedRating = 0;
let notificationActiveFilter = localStorage.getItem('hc_notification_filter') || 'all';

const formatTimeAgo = (isoDate) => {
    const now = Date.now();
    const ts = new Date(isoDate).getTime();
    const diffSec = Math.max(1, Math.floor((now - ts) / 1000));

    if (diffSec < 60) return `${diffSec}s ago`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDay = Math.floor(diffHr / 24);
    return `${diffDay}d ago`;
};

const notificationTypeLabel = (type) => {
    const map = {
        offer_received: 'Offer',
        offer_accepted: 'Accepted',
        work_marked_done: 'Done',
        work_confirmed: 'Confirmed',
        rated: 'Rating',
        message_received: 'Message',
        reminder_mark_done: 'Reminder',
        reminder_confirm_done: 'Reminder',
        reminder_rate: 'Reminder',
        payment_received: 'Payment',
        testimonial_received: 'Thanks',
        emergency_sos: 'SOS',
    };

    return map[type] || 'Update';
};

const passesNotificationFilter = (item) => {
    if (!item) return false;

    if (notificationActiveFilter === 'unread') {
        return !item.isRead;
    }

    if (notificationActiveFilter === 'reminders') {
        return typeof item.type === 'string' && item.type.startsWith('reminder_');
    }

    if (notificationActiveFilter === 'messages') {
        return item.type === 'message_received';
    }

    return true;
};

const renderNotificationFilters = () => {
    const host = document.getElementById('notificationFilters');
    if (!host) return;

    const options = [
        { key: 'all', label: 'All' },
        { key: 'unread', label: 'Unread' },
        { key: 'reminders', label: 'Reminders' },
        { key: 'messages', label: 'Messages' },
    ];

    host.innerHTML = options.map((option) => {
        const active = option.key === notificationActiveFilter ? 'active' : '';
        return `<button type="button" class="notification-filter-chip ${active}" data-filter="${option.key}">${option.label}</button>`;
    }).join('');

    host.querySelectorAll('.notification-filter-chip').forEach((btn) => {
        btn.addEventListener('click', async () => {
            notificationActiveFilter = btn.getAttribute('data-filter') || 'all';
            localStorage.setItem('hc_notification_filter', notificationActiveFilter);
            renderNotificationFilters();
            await loadNotifications();
        });
    });
};

const notificationLinkFor = (notification) => {
    if (notification.post) {
        return `task-detail.html?id=${notification.post}`;
    }
    if (notification.conversation) {
        return `chat.html?conversationId=${notification.conversation}`;
    }
    return null;
};

const notificationActionFor = (notification) => {
    const postLink = notification.post ? `task-detail.html?id=${notification.post}` : null;

    switch (notification.type) {
        case 'reminder_rate':
            return postLink ? { label: 'Rate now', actionType: 'rate_now', postId: notification.post } : null;
        case 'reminder_mark_done':
            return postLink ? { label: 'Mark done now', actionType: 'mark_done', postId: notification.post } : null;
        case 'reminder_confirm_done':
            return notification.post
                ? { label: 'Confirm done', actionType: 'confirm_done', postId: notification.post }
                : { label: 'Review now', link: 'profile.html' };
        case 'offer_received':
            return { label: 'View offers', link: 'profile.html' };
        case 'work_marked_done':
            return notification.post
                ? { label: 'Confirm now', actionType: 'confirm_done', postId: notification.post }
                : { label: 'Confirm now', link: 'profile.html' };
        case 'message_received':
            return notification.conversation
                ? { label: 'Reply', link: `chat.html?conversationId=${notification.conversation}` }
                : { label: 'Open chat', link: 'chat.html' };
        default:
            return null;
    }
};

const renderNotifications = (items) => {
    const listEl = document.getElementById('notificationList');
    if (!listEl) return;

    const visibleItems = Array.isArray(items) ? items.filter(passesNotificationFilter) : [];

    if (!visibleItems || visibleItems.length === 0) {
        listEl.innerHTML = '<div class="notification-empty">No notifications yet</div>';
        return;
    }

    listEl.innerHTML = visibleItems.map((item) => {
        const unreadClass = item.isRead ? '' : 'unread';
        const defaultLink = notificationLinkFor(item) || '';
        const action = notificationActionFor(item);
        return `
            <div class="notification-item ${unreadClass}" data-id="${item._id}" data-link="${defaultLink}">
                <div class="notification-type-chip">${notificationTypeLabel(item.type)}</div>
                <div class="notification-title">${item.title}</div>
                <div class="notification-body">${item.body}</div>
                <div class="notification-meta">${formatTimeAgo(item.createdAt)}</div>
                ${action ? `<button class="notification-action-btn" data-action-link="${action.link || ''}" data-action-type="${action.actionType || ''}" data-action-post="${action.postId || ''}">${action.label}</button>` : ''}
            </div>
        `;
    }).join('');

    listEl.querySelectorAll('.notification-item').forEach((el) => {
        el.addEventListener('click', async () => {
            const id = el.getAttribute('data-id');
            const link = el.getAttribute('data-link');

            try {
                await fetch(`${NOTIFICATION_API}/${id}/read`, {
                    method: 'PATCH',
                    headers: getHeaders(),
                });
            } catch (_) {
                // ignore mark-read failures to avoid blocking navigation
            }

            if (link) {
                window.location.href = link;
                return;
            }

            await loadNotifications();
            await loadUnreadCount();
        });

        const actionBtn = el.querySelector('.notification-action-btn');
        if (actionBtn) {
            actionBtn.addEventListener('click', async (e) => {
                e.stopPropagation();

                const id = el.getAttribute('data-id');
                const actionLink = actionBtn.getAttribute('data-action-link');
                const actionType = actionBtn.getAttribute('data-action-type');
                const actionPostId = actionBtn.getAttribute('data-action-post');

                try {
                    await fetch(`${NOTIFICATION_API}/${id}/read`, {
                        method: 'PATCH',
                        headers: getHeaders(),
                    });
                } catch (_) {
                    // ignore
                }

                if (actionType && actionPostId) {
                    const handledInline = await runInlineNotificationAction(actionType, actionPostId);
                    if (handledInline) {
                        await loadNotifications();
                        await loadUnreadCount();
                        return;
                    }
                }

                if (actionLink) {
                    window.location.href = actionLink;
                }
            });
        }
    });
};

const ensureNotificationRatingModal = () => {
    if (document.getElementById('notificationRatingModal')) return;

    const wrapper = document.createElement('div');
    wrapper.id = 'notificationRatingModal';
    wrapper.className = 'notification-rating-overlay hidden';
    wrapper.innerHTML = `
        <div class="notification-rating-card" role="dialog" aria-modal="true" aria-labelledby="notificationRatingTitle">
            <div class="notification-rating-head">
                <h3 id="notificationRatingTitle">Rate this work</h3>
                <button type="button" class="notification-rating-close" id="notificationRatingClose">✕</button>
            </div>
            <p class="notification-rating-copy">Give a quick star rating for this completed help.</p>
            <div id="notificationRatingStars" class="notification-rating-stars"></div>
            <p id="notificationRatingHint" class="notification-rating-hint">Select a rating</p>
            <div class="notification-rating-actions">
                <button type="button" class="notification-rating-btn secondary" id="notificationRatingCancel">Cancel</button>
                <button type="button" class="notification-rating-btn primary" id="notificationRatingSubmit">Submit</button>
            </div>
        </div>
    `;

    document.body.appendChild(wrapper);

    wrapper.addEventListener('click', (e) => {
        const target = e.target;
        if (!(target instanceof Element)) return;

        if (
            target.id === 'notificationRatingClose' ||
            target.id === 'notificationRatingCancel'
        ) {
            closeNotificationRatingModal();
            return;
        }

        if (target.id === 'notificationRatingSubmit') {
            submitNotificationRating();
            return;
        }

        if (target.classList.contains('notification-rating-star')) {
            notificationSelectedRating = Number(target.getAttribute('data-value')) || 0;
            renderNotificationRatingStars(notificationSelectedRating);
            const hint = document.getElementById('notificationRatingHint');
            if (hint) hint.textContent = `${notificationSelectedRating}/5 selected`;
            return;
        }

        if (e.target === wrapper) {
            closeNotificationRatingModal();
        }
    });
};

const renderNotificationRatingStars = (activeValue) => {
    const starsEl = document.getElementById('notificationRatingStars');
    if (!starsEl) return;

    starsEl.innerHTML = [1, 2, 3, 4, 5].map((value) => {
        const active = value <= activeValue ? 'active' : '';
        return `<button type="button" class="notification-rating-star ${active}" data-value="${value}">★</button>`;
    }).join('');
};

const openNotificationRatingModal = (postId) => {
    ensureNotificationRatingModal();

    notificationRatingPostId = postId;
    notificationSelectedRating = 0;
    renderNotificationRatingStars(0);

    const hint = document.getElementById('notificationRatingHint');
    if (hint) hint.textContent = 'Select a rating';

    const overlay = document.getElementById('notificationRatingModal');
    if (overlay) overlay.classList.remove('hidden');
};

const closeNotificationRatingModal = () => {
    const overlay = document.getElementById('notificationRatingModal');
    if (overlay) overlay.classList.add('hidden');
    notificationRatingPostId = null;
    notificationSelectedRating = 0;
};

const submitNotificationRating = async () => {
    if (!notificationRatingPostId) return false;

    if (!Number.isInteger(notificationSelectedRating) || notificationSelectedRating < 1 || notificationSelectedRating > 5) {
        showToast('Please choose a rating from 1 to 5', 'error');
        return false;
    }

    try {
        const res = await fetch(`/api/posts/${notificationRatingPostId}/rate`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ rating: notificationSelectedRating }),
        });

        const data = await res.json();
        if (res.ok) {
            showToast(data.message || 'Rating submitted', 'success');
            closeNotificationRatingModal();
            window.dispatchEvent(new CustomEvent('hc:activity-updated'));
            await loadNotifications();
            await loadUnreadCount();
            return true;
        }

        showToast(data.message || 'Could not submit rating', 'error');
        return false;
    } catch (_) {
        showToast('Server error', 'error');
        return false;
    }
};

const fetchPostForNotification = async (postId) => {
    try {
        const res = await fetch(`/api/posts/${postId}`, {
            headers: getHeaders(),
        });
        if (!res.ok) return null;
        return await res.json();
    } catch (_) {
        return null;
    }
};

const getAcceptedOfferForHelper = (post) => {
    if (!post || !Array.isArray(post.offers) || !notificationCurrentUserId) return null;

    return post.offers.find((offer) => {
        const offerUserId = offer?.user?._id ? offer.user._id : offer?.user;
        if (!offerUserId) return false;
        if (String(offerUserId) !== String(notificationCurrentUserId)) return false;
        if (offer.status !== 'accepted') return false;
        return (offer.completionStatus || 'in_progress') !== 'marked_done';
    }) || null;
};

const getAcceptedMarkedDoneOfferForRequester = (post) => {
    if (!post || !Array.isArray(post.offers) || !notificationCurrentUserId) return null;

    const authorId = post?.author?._id ? post.author._id : post?.author;
    if (!authorId || String(authorId) !== String(notificationCurrentUserId)) return null;

    return post.offers.find((offer) => {
        if (offer.status !== 'accepted') return false;
        return (offer.completionStatus || 'in_progress') === 'marked_done';
    }) || null;
};

const runInlineNotificationAction = async (actionType, postId) => {
    const post = await fetchPostForNotification(postId);
    if (!post) {
        showToast('Could not load task details', 'error');
        return false;
    }

    if (actionType === 'mark_done') {
        const helperOffer = getAcceptedOfferForHelper(post);
        if (!helperOffer) {
            showToast('No active accepted task to mark done', 'error');
            return false;
        }

        try {
            const res = await fetch(`/api/posts/${postId}/done/${helperOffer._id}`, {
                method: 'POST',
                headers: getHeaders(),
            });
            const data = await res.json();
            if (res.ok) {
                showToast(data.message || 'Marked as done', 'success');
                return true;
            }
            showToast(data.message || 'Could not mark done', 'error');
            return false;
        } catch (_) {
            showToast('Server error', 'error');
            return false;
        }
    }

    if (actionType === 'confirm_done') {
        const requesterOffer = getAcceptedMarkedDoneOfferForRequester(post);
        if (!requesterOffer) {
            showToast('No pending completion to confirm', 'error');
            return false;
        }

        try {
            const res = await fetch(`/api/posts/${postId}/confirm/${requesterOffer._id}`, {
                method: 'POST',
                headers: getHeaders(),
                body: JSON.stringify({ isDone: true }),
            });
            const data = await res.json();
            if (res.ok) {
                showToast(data.message || 'Work confirmed', 'success');
                return true;
            }
            showToast(data.message || 'Could not confirm work', 'error');
            return false;
        } catch (_) {
            showToast('Server error', 'error');
            return false;
        }
    }

    if (actionType === 'rate_now') {
        openNotificationRatingModal(postId);
        return true;
    }

    return false;
};

const loadNotifications = async () => {
    try {
        const res = await fetch(`${NOTIFICATION_API}?limit=20`, {
            headers: getHeaders(),
        });

        if (!res.ok) return;
        const items = await res.json();
        renderNotifications(items);
    } catch (_) {
        // silent fail
    }
};

const loadUnreadCount = async () => {
    const badge = document.getElementById('notificationBadge');
    if (!badge) return;

    try {
        const res = await fetch(`${NOTIFICATION_API}/unread-count`, {
            headers: getHeaders(),
        });

        if (!res.ok) return;

        const data = await res.json();
        const count = Number(data.unreadCount || 0);

        if (count > 0) {
            badge.textContent = count > 99 ? '99+' : String(count);
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }
    } catch (_) {
        // silent fail
    }
};

const markAllRead = async () => {
    try {
        await fetch(`${NOTIFICATION_API}/read-all`, {
            method: 'PATCH',
            headers: getHeaders(),
        });

        await loadNotifications();
        await loadUnreadCount();
    } catch (_) {
        // silent fail
    }
};

const setupNotificationCenter = () => {
    const btn = document.getElementById('notificationBtn');
    const panel = document.getElementById('notificationPanel');
    const markAllBtn = document.getElementById('notificationMarkAll');

    if (!btn || !panel) return;

    const header = panel.querySelector('.notification-panel-header');
    if (header && !document.getElementById('notificationFilters')) {
        const filterWrap = document.createElement('div');
        filterWrap.id = 'notificationFilters';
        filterWrap.className = 'notification-filter-row';
        panel.insertBefore(filterWrap, header.nextSibling);
    }

    renderNotificationFilters();

    btn.addEventListener('click', async () => {
        panel.classList.toggle('hidden');
        if (!panel.classList.contains('hidden')) {
            await loadNotifications();
            await loadUnreadCount();
        }
    });

    if (markAllBtn) {
        markAllBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            markAllRead();
        });
    }

    document.addEventListener('click', (e) => {
        if (!panel.contains(e.target) && !btn.contains(e.target)) {
            panel.classList.add('hidden');
        }
    });
};

const resolveNotificationCurrentUser = async () => {
    try {
        if (typeof getMe === 'function') {
            return await getMe();
        }

        if (typeof getToken !== 'function' || !getToken()) {
            return null;
        }

        const headers = typeof getHeaders === 'function'
            ? getHeaders()
            : {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${getToken()}`,
            };

        const res = await fetch('/api/auth/me', { headers });
        if (!res.ok) return null;
        return await res.json();
    } catch (_) {
        return null;
    }
};

document.addEventListener('DOMContentLoaded', async () => {
    if (typeof getToken !== 'function' || !getToken()) return;

    const me = await resolveNotificationCurrentUser();
    notificationCurrentUserId = me && me._id ? me._id : null;

    setupNotificationCenter();
    ensureNotificationRatingModal();
    renderNotificationFilters();
    await loadUnreadCount();

    if (notificationRefreshTimer) {
        clearInterval(notificationRefreshTimer);
    }

    notificationRefreshTimer = setInterval(loadUnreadCount, 15000);
});
