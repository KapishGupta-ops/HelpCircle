const getFeed = async (lat, lng) => {
    try {
        const res = await fetch(`${API_BASE_URL}/posts/feed?lat=${lat}&lng=${lng}`, {
            headers: getHeaders()
        });
        if (res.ok) return await res.json();
        return [];
    } catch (err) {
        return [];
    }
};

const getRecommendedFeed = async (lat, lng) => {
    try {
        const res = await fetch(`${API_BASE_URL}/posts/recommended?lat=${lat}&lng=${lng}`, {
            headers: getHeaders()
        });
        if (res.ok) return await res.json();
        return [];
    } catch (err) {
        return [];
    }
};

const createPost = async (postData) => {
    try {
        const res = await fetch(`${API_BASE_URL}/posts`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify(postData)
        });
        const data = await res.json();
        if (res.ok) {
            showToast('Help request posted!', 'success');
            window.dispatchEvent(new CustomEvent('hc:activity-updated'));
            return true;
        }
        showToast(data.message || 'Post failed', 'error');
        return false;
    } catch (err) {
        showToast('Server error', 'error');
        return false;
    }
};

const offerHelp = async (postId, message) => {
    try {
        // Send offer (idempotent on backend after first successful offer)
        const offerRes = await fetch(`${API_BASE_URL}/posts/${postId}/offer`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ message })
        });
        
        const offerData = await offerRes.json();
        
        if (!offerRes.ok) {
            showToast(offerData.message || 'Offer failed', 'error');
            return false;
        }

        // Create/get a conversation with the post author
        const authorId = offerData.authorId;
        
        const chatRes = await fetch('/api/chat/conversations', {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ otherUserId: authorId })
        });
        
        if (!chatRes.ok) {
            showToast('Offer sent but chat creation failed', 'error');
            return false;
        }
        
        const conversation = await chatRes.json();

        // Send the typed message into chat as well so repeated modal messages work.
        if (message && message.trim()) {
            const msgRes = await fetch('/api/chat/messages', {
                method: 'POST',
                headers: getHeaders(),
                body: JSON.stringify({
                    conversationId: conversation._id,
                    content: message.trim()
                })
            });

            if (!msgRes.ok) {
                const msgData = await msgRes.json().catch(() => ({}));
                showToast(msgData.message || 'Message could not be sent to chat', 'error');
                return false;
            }
        }
        
        showToast('Message sent! Opening chat...', 'success');
        window.dispatchEvent(new CustomEvent('hc:activity-updated'));
        
        // Redirect to chat
        setTimeout(() => {
            window.location.href = `chat.html?conversationId=${conversation._id}`;
        }, 500);
        
        return true;
    } catch (err) {
        console.error('Error offering help:', err);
        showToast('Server error', 'error');
        return false;
    }
};

const acceptOffer = async (postId, offerId) => {
    try {
        const res = await fetch(`${API_BASE_URL}/posts/${postId}/accept/${offerId}`, {
            method: 'POST',
            headers: getHeaders()
        });
        const data = await res.json();
        if (res.ok) {
            showToast('Offer accepted! Karma points awarded.', 'success');
            return true;
        }
        showToast(data.message || 'Accept failed', 'error');
        return false;
    } catch (err) {
        showToast('Server error', 'error');
        return false;
    }
};

const markWorkDone = async (postId, offerId) => {
    try {
        const res = await fetch(`${API_BASE_URL}/posts/${postId}/done/${offerId}`, {
            method: 'POST',
            headers: getHeaders()
        });
        const data = await res.json();
        if (res.ok) {
            showToast(data.message || 'Marked as done. Waiting for confirmation.', 'success');
            return true;
        }
        showToast(data.message || 'Could not mark done', 'error');
        return false;
    } catch (err) {
        showToast('Server error', 'error');
        return false;
    }
};

const confirmWorkDone = async (postId, offerId, isDone) => {
    try {
        const res = await fetch(`${API_BASE_URL}/posts/${postId}/confirm/${offerId}`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ isDone })
        });
        const data = await res.json();
        if (res.ok) {
            showToast(data.message || 'Status updated', 'success');
            return true;
        }
        showToast(data.message || 'Could not update status', 'error');
        return false;
    } catch (err) {
        showToast('Server error', 'error');
        return false;
    }
};

const getMyPosts = async () => {
    try {
        const res = await fetch(`${API_BASE_URL}/posts/me`, { headers: getHeaders() });
        if (res.ok) return await res.json();
        return [];
    } catch (err) {
        return [];
    }
};

const getHelpedPosts = async () => {
    try {
        const res = await fetch(`${API_BASE_URL}/posts/helped`, { headers: getHeaders() });
        if (res.ok) return await res.json();
        return [];
    } catch (err) {
        return [];
    }
};

const deleteIssue = async (postId) => {
    try {
        const res = await fetch(`${API_BASE_URL}/posts/${postId}`, {
            method: 'DELETE',
            headers: getHeaders()
        });
        const data = await res.json();
        if (res.ok) {
            showToast(data.message || 'Issue deleted successfully', 'success');
            return true;
        }
        showToast(data.message || 'Could not delete issue', 'error');
        return false;
    } catch (err) {
        showToast('Server error', 'error');
        return false;
    }
};

const bulkOfferHelp = async (postIds, message) => {
    try {
        const res = await fetch(`${API_BASE_URL}/posts/bulk-offer`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ postIds, message })
        });
        const data = await res.json();
        if (res.ok) {
            showToast(data.message || 'Bulk offers sent!', 'success');
            return true;
        }
        showToast(data.message || 'Bulk offer failed', 'error');
        return false;
    } catch (err) {
        showToast('Server error', 'error');
        return false;
    }
};

const getRelatedPosts = async (postId) => {
    try {
        const res = await fetch(`${API_BASE_URL}/posts/${postId}/related`, {
            headers: getHeaders()
        });
        if (res.ok) return await res.json();
        return [];
    } catch (err) {
        return [];
    }
};

const getLeaderboard = async () => {
    try {
        const res = await fetch(`${API_BASE_URL}/community/leaderboard`, {
            headers: getHeaders()
        });
        if (res.ok) return await res.json();
        return [];
    } catch (err) {
        return [];
    }
};

const getNeighborhoodGroups = async () => {
    try {
        const res = await fetch(`${API_BASE_URL}/community/groups`, {
            headers: getHeaders()
        });
        if (res.ok) return await res.json();
        return [];
    } catch (err) {
        return [];
    }
};

const createNeighborhoodGroup = async (name, description) => {
    try {
        const res = await fetch(`${API_BASE_URL}/community/groups`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ name, description })
        });
        const data = await res.json();
        if (res.ok) {
            showToast('Circle created successfully!', 'success');
            return data;
        }
        showToast(data.message || 'Could not create circle', 'error');
        return null;
    } catch (err) {
        showToast('Server error', 'error');
        return null;
    }
};

const joinGroup = async (groupId) => {
    try {
        const res = await fetch(`${API_BASE_URL}/community/groups/${groupId}/join`, {
            method: 'POST',
            headers: getHeaders()
        });
        const data = await res.json();
        if (res.ok) {
            showToast('Joined group!', 'success');
            return true;
        }
        showToast(data.message || 'Join failed', 'error');
        return false;
    } catch (err) {
        showToast('Server error', 'error');
        return false;
    }
};

const submitTestimonial = async (to, post, message) => {
    try {
        const res = await fetch(`${API_BASE_URL}/community/testimonials`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ to, post, message })
        });
        const data = await res.json();
        if (res.ok) {
            showToast('Thank you message sent!', 'success');
            return true;
        }
        showToast(data.message || 'Submission failed', 'error');
        return false;
    } catch (err) {
        showToast('Server error', 'error');
        return false;
    }
};

const getUserTestimonials = async (userId) => {
    try {
        const res = await fetch(`${API_BASE_URL}/community/testimonials/${userId}`, {
            headers: getHeaders()
        });
        if (res.ok) return await res.json();
        return [];
    } catch (err) {
        return [];
    }
};

const rateUserForPost = async (postId, rating) => {
    try {
        const res = await fetch(`${API_BASE_URL}/posts/${postId}/rate`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ rating })
        });
        const data = await res.json();
        if (res.ok) {
            showToast(data.message || 'Rating submitted', 'success');
            return true;
        }
        showToast(data.message || 'Could not submit rating', 'error');
        return false;
    } catch (err) {
        showToast('Server error', 'error');
        return false;
    }
};

const payForTask = async (postId) => {
    try {
        const res = await fetch(`${API_BASE_URL}/posts/${postId}/pay`, {
            method: 'POST',
            headers: getHeaders()
        });
        const data = await res.json();
        if (res.ok) {
            showToast('Payment successful!', 'success');
            return data.invoice;
        }
        showToast(data.message || 'Payment failed', 'error');
        return null;
    } catch (err) {
        showToast('Server error', 'error');
        return null;
    }
};

const getInvoice = async (invoiceId) => {
    try {
        const res = await fetch(`${API_BASE_URL}/community/invoices/${invoiceId}`, {
            headers: getHeaders()
        });
        if (res.ok) return await res.json();
        return null;
    } catch (err) {
        return null;
    }
};

const updateAvailability = async (availability) => {
    try {
        const res = await fetch(`${API_BASE_URL}/auth/availability`, {
            method: 'PATCH',
            headers: getHeaders(),
            body: JSON.stringify({ availability })
        });
        const data = await res.json();
        if (res.ok) {
            showToast('Availability updated!', 'success');
            return true;
        }
        showToast(data.message || 'Update failed', 'error');
        return false;
    } catch (err) {
        showToast('Server error', 'error');
        return false;
    }
};
