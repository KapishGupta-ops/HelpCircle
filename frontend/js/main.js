document.addEventListener('DOMContentLoaded', async () => {
    // Check for token on protected pages
    const token = getToken();
    const isAuthPage = window.location.pathname.includes('login.html') || window.location.pathname.includes('register.html');
    
    if (!token && !isAuthPage) {
        window.location.href = 'login.html';
        return;
    }

    // Load initial data for index page
    if (window.location.pathname.includes('index.html') || window.location.pathname.endsWith('/')) {
        const user = await getMe();
        if (user) {
            document.getElementById('userInitial').textContent = user.name[0].toUpperCase();
        }
        await refreshWalletSummary();

        await setupOnboardingPanel();
    }

    // Modal Listeners
    setupModals();

    // Form Listeners
    setupForms();

    // Bulk Offer Logic
    setupBulkOffer();

});

let bulkMode = false;
let selectedPosts = new Set();
let currentWalletSummary = { availableBalance: 0, lockedBalance: 0, totalBalance: 0 };

const formatCurrency = (amount) => `₹${Number(amount || 0).toFixed(2)}`;

async function refreshWalletSummary() {
    const wallet = await getWalletSummary();
    if (!wallet) return;

    currentWalletSummary = wallet;

    const navWalletEl = document.getElementById('userWalletDisplay');
    if (navWalletEl) {
        navWalletEl.textContent = formatCurrency(wallet.availableBalance);
    }

    const createWalletEl = document.getElementById('createWalletBalance');
    if (createWalletEl) {
        createWalletEl.textContent = `Wallet: ${formatCurrency(wallet.availableBalance)} (Locked: ${formatCurrency(wallet.lockedBalance)})`;
    }

    updateEscrowHint();
}

function updateEscrowHint() {
    const hintEl = document.getElementById('createEscrowHint');
    const priceInput = document.getElementById('postPrice');
    if (!hintEl || !priceInput) return;

    const reward = Math.max(0, Number(priceInput.value || 0));

    if (reward <= 0) {
        hintEl.textContent = 'Escrow will be locked when you accept a helper';
        hintEl.className = 'mt-1 text-[10px] font-bold uppercase tracking-widest text-slate-400';
        return;
    }

    const available = Number(currentWalletSummary.availableBalance || 0);
    if (available >= reward) {
        hintEl.textContent = `Ready: ${formatCurrency(reward)} can be locked in escrow on helper acceptance`;
        hintEl.className = 'mt-1 text-[10px] font-bold uppercase tracking-widest text-emerald-600';
    } else {
        const shortfall = reward - available;
        hintEl.textContent = `Insufficient wallet: short by ${formatCurrency(shortfall)}. Top up before posting.`;
        hintEl.className = 'mt-1 text-[10px] font-bold uppercase tracking-widest text-red-500';
    }
}

function setupBulkOffer() {
    const bulkBtn = document.getElementById('bulkOfferBtn');
    const bulkBar = document.getElementById('bulkOfferBar');
    const cancelBulk = document.getElementById('cancelBulk');
    const confirmBulk = document.getElementById('confirmBulk');
    const bulkCountText = document.getElementById('bulkCountText');

    if (!bulkBtn) return;

    bulkBtn.onclick = () => {
        bulkMode = !bulkMode;
        if (bulkMode) {
            bulkBtn.textContent = 'Exit Bulk Mode';
            bulkBtn.classList.add('bulk-offer-active');
            bulkBar.classList.remove('hidden');
        } else {
            exitBulkMode();
        }
    };

    cancelBulk.onclick = exitBulkMode;

    confirmBulk.onclick = async () => {
        if (selectedPosts.size === 0) {
            showToast('Select at least one request', 'info');
            return;
        }
        
        const message = prompt('Enter a message for your bulk offer:', 'I can help with these!');
        if (message === null) return;

        const postIds = Array.from(selectedPosts);
        if (await bulkOfferHelp(postIds, message)) {
            exitBulkMode();
            // Refresh feed
            const pos = await getCurrentLocation();
            const posts = await getFeed(pos.lat, pos.lng);
            window.renderFeed(posts);
        }
    };

    function exitBulkMode() {
        bulkMode = false;
        selectedPosts.clear();
        bulkBtn.textContent = 'Bulk Offer';
        bulkBtn.classList.remove('bulk-offer-active');
        bulkBar.classList.add('hidden');
        document.querySelectorAll('.card-selected').forEach(el => el.classList.remove('card-selected', 'ring-4', 'ring-primary-500'));
        updateBulkCount();
    }
}

function updateBulkCount() {
    const text = document.getElementById('bulkCountText');
    if (text) text.textContent = `${selectedPosts.size} requests selected`;
}

async function setupOnboardingPanel() {
    const panel = document.getElementById('onboardingPanel');
    if (!panel) return;

    const dismissBtn = document.getElementById('onboardingDismiss');
    const primaryBtn = document.getElementById('onboardingPrimaryAction');
    const secondaryBtn = document.getElementById('onboardingSecondaryAction');
    const titleEl = document.getElementById('onboardingTitle');
    const bodyEl = document.getElementById('onboardingBody');

    const dismissed = localStorage.getItem('hc_onboarding_dismissed') === '1';
    const status = await getOnboardingStatus();
    if (!status) return;

    if (status.hasPostedRequest && status.hasOfferedHelp && status.hasCompletedHelp) {
        panel.classList.add('hidden');
        return;
    }

    if (dismissed) {
        panel.classList.add('hidden');
    } else {
        panel.classList.remove('hidden');
    }

    const openCreate = () => {
        const createModal = document.getElementById('createModal');
        if (createModal) createModal.classList.remove('hidden');
    };

    const scrollToFeed = () => {
        const feed = document.getElementById('feedList');
        if (feed) feed.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    if (!status.hasPostedRequest) {
        titleEl.textContent = 'Post your first request';
        bodyEl.textContent = 'Ask for help once to activate your local support loop. Most users get a response faster after their first request.';
        primaryBtn.textContent = 'Create First Request';
        primaryBtn.onclick = openCreate;
        secondaryBtn.textContent = 'Browse Nearby First';
        secondaryBtn.onclick = scrollToFeed;
    } else if (!status.hasOfferedHelp) {
        titleEl.textContent = 'Offer help once';
        bodyEl.textContent = 'Helping someone nearby once increases your trust score and reply rate on your own requests.';
        primaryBtn.textContent = 'Find Someone to Help';
        primaryBtn.onclick = scrollToFeed;
        secondaryBtn.textContent = 'Create Another Request';
        secondaryBtn.onclick = openCreate;
    } else {
        titleEl.textContent = 'Complete your first success';
        bodyEl.textContent = 'You are almost there. Confirm one completed task and exchange ratings to unlock stronger profile trust.';
        primaryBtn.textContent = 'Go to My Activity';
        primaryBtn.onclick = () => {
            window.location.href = 'profile.html';
        };
        secondaryBtn.textContent = 'Browse Feed';
        secondaryBtn.onclick = scrollToFeed;
    }

    dismissBtn.onclick = () => {
        localStorage.setItem('hc_onboarding_dismissed', '1');
        panel.classList.add('hidden');
    };

    // If user performs key actions, refresh this panel automatically.
    window.addEventListener('hc:activity-updated', async () => {
        localStorage.removeItem('hc_onboarding_dismissed');
        await setupOnboardingPanel();
    }, { once: true });
}

function setupModals() {
    const createModal = document.getElementById('createModal');
    const openBtn = document.getElementById('openCreateModal');
    const closeBtn = document.getElementById('closeCreateModal');
    const openSOSBtn = document.getElementById('openSOSModal');

    if (openBtn) openBtn.onclick = () => {
        createModal.classList.remove('hidden');
        document.getElementById('postIsSOS').checked = false;
    };
    if (openSOSBtn) openSOSBtn.onclick = () => {
        createModal.classList.remove('hidden');
        document.getElementById('postIsSOS').checked = true;
        document.getElementById('postUrgent').checked = true;
    };
    if (closeBtn) closeBtn.onclick = () => createModal.classList.add('hidden');

    const offerModal = document.getElementById('offerModal');
    const cancelOffer = document.getElementById('cancelOffer');
    if (cancelOffer) cancelOffer.onclick = () => offerModal.classList.add('hidden');
}

function setupForms() {
    const createPostForm = document.getElementById('createPostForm');
    const categorySelect = document.getElementById('postCategory');
    const priceSuggestion = document.getElementById('priceSuggestion');

    const SUGGESTED_PRICES = {
        'Notes': 'avg ₹50',
        'Charger': 'avg ₹20',
        'Bike Repair': 'avg ₹200',
        'Groceries': 'avg ₹100',
        'Ride': 'avg ₹150',
        'Medical': 'avg ₹300',
        'Other': ''
    };

    if (categorySelect) {
        categorySelect.onchange = () => {
            const cat = categorySelect.value;
            priceSuggestion.textContent = SUGGESTED_PRICES[cat] || '';
        };
    }
    const priceInput = document.getElementById('postPrice');
    if (priceInput) {
        priceInput.addEventListener('input', updateEscrowHint);
    }

    if (createPostForm) {
        createPostForm.onsubmit = async (e) => {
            e.preventDefault();
            const reward = Math.max(0, Number(document.getElementById('postPrice').value || 0));
            const available = Number(currentWalletSummary.availableBalance || 0);
            if (reward > 0 && available < reward) {
                showToast(`Insufficient wallet balance. Add at least ${formatCurrency(reward - available)} more.`, 'error');
                return;
            }
            
            showToast("Getting current location...", "info");

            try {
                const pos = await getCurrentLocation();
                const postData = {
                    title: document.getElementById('postTitle').value,
                    category: document.getElementById('postCategory').value,
                    description: document.getElementById('postDescription').value,
                    isUrgent: document.getElementById('postUrgent').checked,
                    scheduledFor: document.getElementById('postScheduledFor').value || null,
                    expiresAt: document.getElementById('postExpiresAt').value || null,
                    isEvent: document.getElementById('postIsEvent').checked,
                    isRecurring: document.getElementById('postIsRecurring').checked,
                    isSOS: document.getElementById('postIsSOS').checked,
                    price: document.getElementById('postPrice').value || 0,
                    lat: pos.lat,
                    lng: pos.lng
                };

                if (await createPost(postData)) {
                    document.getElementById('createModal').classList.add('hidden');
                    createPostForm.reset();
                    updateEscrowHint();
                    // Reload feed and map
                    const posts = await getFeed(pos.lat, pos.lng);
                    window.renderFeed(posts);
                    if (window.displayPostsOnMap) window.displayPostsOnMap(posts);
                    await refreshWalletSummary();
                }
            } catch (err) {
                console.error("Post location error:", err);
                showToast("Could not get location. Post failed.", "error");
            }
        };
    }
}

// Global Feed Rendering
window.renderFeed = (posts) => {
    const list = document.getElementById('feedList');
    if (!list) return;

    if (posts.length === 0) {
        list.innerHTML = `<div class="col-span-full card p-16 text-center">
            <div class="w-20 h-20 bg-slate-50 dark:bg-slate-800 rounded-3xl flex items-center justify-center mx-auto mb-6 text-slate-300 dark:text-slate-600">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                </svg>
            </div>
            <h3 class="text-xl font-bold mb-2">Quiet neighborhood!</h3>
            <p class="font-medium">No requests nearby. Why not be the first to ask?</p>
        </div>`;
        return;
    }

    list.innerHTML = posts.map(post => {
        const authorRating = Number(post.author.ratingAverage || 0).toFixed(1);
        const authorRatingCount = Number(post.author.ratingCount || 0);
        const totalRequests = Number(post.author.totalRequestsCreated || 0);
        const closedRequests = Number(post.author.totalRequestsClosed || 0);
        const completionRate = totalRequests > 0 ? Math.round((closedRequests / totalRequests) * 100) : 0;
        const avgResponse = Number(post.author.avgResponseMinutes || 0);
        const categoryStyle = {
            'Notes': 'background: var(--color-bg-secondary); color: var(--color-info); border-color: var(--color-info);',
            'Charger': 'background: var(--color-bg-secondary); color: var(--color-secondary); border-color: var(--color-secondary);',
            'Bike Repair': 'background: var(--color-bg-secondary); color: var(--color-success); border-color: var(--color-success);',
            'Groceries': 'background: var(--color-bg-secondary); color: var(--color-warning); border-color: var(--color-warning);',
            'Ride': 'background: var(--color-bg-secondary); color: var(--color-accent); border-color: var(--color-accent);',
            'Medical': 'background: var(--color-bg-secondary); color: var(--color-danger); border-color: var(--color-danger);',
            'Other': 'background: var(--color-bg-secondary); color: var(--color-text-tertiary); border-color: var(--color-border);'
        }[post.category] || 'background: var(--color-bg-secondary); color: var(--color-text-tertiary); border-color: var(--color-border);';

        return `
        <div id="post-${post._id}" class="card card-interactive p-6 flex flex-col group transition-all duration-300 cursor-pointer" onclick="openTaskDetail('${post._id}')">
            <div class="flex items-start justify-between mb-6">
                <div class="flex items-center gap-3">
                    <div class="w-12 h-12 bg-gradient-to-br from-primary-500 to-primary-600 text-white rounded-2xl flex items-center justify-center font-bold text-xl border-2 border-white dark:border-slate-700 shadow-sm">
                        ${post.author.name[0].toUpperCase()}
                    </div>
                    <div>
                        <h3 class="font-bold leading-tight group-hover:text-primary-600 transition-colors">${post.author.name}</h3>
                        <div class="flex items-center gap-2 mt-1">
                            <span class="text-[10px] font-extrabold text-primary-600 uppercase tracking-tighter">★ ${post.author.karma} Karma</span>
                            <span class="text-slate-300 dark:text-slate-700 text-[10px]">•</span>
                            <span class="text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-tight">⭐ ${authorRating} (${authorRatingCount})</span>
                            <span class="text-slate-300 dark:text-slate-700 text-[10px]">•</span>
                            <span class="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-tight">${post.distance} km away</span>
                        </div>
                        <div class="flex items-center gap-2 mt-1">
                            <span class="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-tight">✔ ${completionRate}% complete</span>
                            <span class="text-slate-300 dark:text-slate-700 text-[10px]">•</span>
                            <span class="text-[10px] font-bold text-sky-600 dark:text-sky-400 uppercase tracking-tight">⏱ ${avgResponse}m avg response</span>
                        </div>
                    </div>
                </div>
                ${post.isUrgent ? `<span class="badge badge-urgent animate-pulse">🔥 Urgent</span>` : ''}
            </div>

            <div class="flex-1">
                <span class="inline-block px-3 py-1 rounded-lg text-[10px] font-bold uppercase tracking-widest border mb-3" style="${categoryStyle}">${post.category}</span>
                <h4 class="text-xl font-extrabold mb-2 leading-snug">${post.title}</h4>
                <p class="text-sm font-medium line-clamp-3 mb-6">${post.description}</p>
            </div>

            <div class="flex items-center justify-between pt-6 border-t border-slate-100 dark:border-slate-800">
                <span class="text-[10px] font-bold text-slate-300 dark:text-slate-600 uppercase tracking-widest">${new Date(post.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                <button onclick="event.stopPropagation(); openOfferModal('${post._id}')" class="px-6 py-3 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-extrabold rounded-xl hover:bg-primary-600 dark:hover:bg-primary-500 dark:hover:text-white transition-all active:scale-95 shadow-lg shadow-slate-100 dark:shadow-none">Help Now</button>
            </div>
        </div>
    `}).join('');
};

window.openTaskDetail = (postId) => {
    if (bulkMode) {
        const card = document.getElementById(`post-${postId}`);
        if (selectedPosts.has(postId)) {
            selectedPosts.delete(postId);
            card.classList.remove('card-selected', 'ring-4', 'ring-primary-500');
        } else {
            selectedPosts.add(postId);
            card.classList.add('card-selected', 'ring-4', 'ring-primary-500');
        }
        updateBulkCount();
        return;
    }
    window.location.href = `task-detail.html?id=${postId}`;
};

let activePostId = null;
window.openOfferModal = (postId) => {
    activePostId = postId;
    document.getElementById('offerModal').classList.remove('hidden');
};

const confirmBtn = document.getElementById('confirmOffer');
if (confirmBtn) {
    confirmBtn.onclick = async () => {
        const msg = document.getElementById('offerMessage').value;
        if (await offerHelp(activePostId, msg)) {
            document.getElementById('offerModal').classList.add('hidden');
            document.getElementById('offerMessage').value = '';
        }
    };
}

window.loadPersonalizedFeeds = () => {};
