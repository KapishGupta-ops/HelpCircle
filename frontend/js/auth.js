const login = async (email, password) => {
    try {
        const res = await fetch(`${API_BASE_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        const data = await res.json();
        if (res.ok) {
            setToken(data.token);
            showToast('Welcome back!', 'success');
            return true;
        }
        showToast(data.message || 'Login failed', 'error');
        return false;
    } catch (err) {
        showToast('Server error', 'error');
        return false;
    }
};

const register = async (userData) => {
    try {
        const res = await fetch(`${API_BASE_URL}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(userData)
        });
        const data = await res.json();
        if (res.ok) {
            setToken(data.token);
            showToast('Account created!', 'success');
            return true;
        }
        showToast(data.message || 'Registration failed', 'error');
        return false;
    } catch (err) {
        showToast('Server error', 'error');
        return false;
    }
};

const verifyAadhaarAPI = async (aadhaarNumber, otp) => {
    try {
        const res = await fetch(`${API_BASE_URL}/auth/verify-aadhaar`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ aadhaarNumber, otp })
        });
        return await res.json();
    } catch (err) {
        return { success: false, message: 'Verification failed' };
    }
};

const verifyAddressAPI = async (address, pincode) => {
    try {
        const res = await fetch(`${API_BASE_URL}/auth/verify-address`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ address, pincode })
        });
        return await res.json();
    } catch (err) {
        return { success: false, message: 'Verification failed' };
    }
};

const getMe = async () => {
    try {
        const res = await fetch(`${API_BASE_URL}/auth/me`, { headers: getHeaders() });
        if (res.ok) return await res.json();
        removeToken();
        return null;
    } catch (err) {
        return null;
    }
};

const getOnboardingStatus = async () => {
    try {
        const res = await fetch(`${API_BASE_URL}/auth/onboarding-status`, { headers: getHeaders() });
        if (res.ok) return await res.json();
        return null;
    } catch (err) {
        return null;
    }
};

const getImpactSummary = async () => {
    try {
        const res = await fetch(`${API_BASE_URL}/auth/impact-summary`, { headers: getHeaders() });
        if (res.ok) return await res.json();
        return null;
    } catch (err) {
        return null;
    }
};

const updatePreferences = async (preferredHelpCategories, recommendationWeights = null) => {
    try {
        const payload = { preferredHelpCategories };
        if (recommendationWeights && typeof recommendationWeights === 'object') {
            payload.recommendationWeights = recommendationWeights;
        }

        const res = await fetch(`${API_BASE_URL}/auth/preferences`, {
            method: 'PATCH',
            headers: getHeaders(),
            body: JSON.stringify(payload)
        });

        const data = await res.json();
        if (res.ok) {
            showToast('Preferences updated', 'success');
            return data;
        }

        showToast(data.message || 'Could not update preferences', 'error');
        return null;
    } catch (err) {
        showToast('Server error', 'error');
        return null;
    }
};

const getWalletSummary = async () => {
    try {
        const res = await fetch(`${API_BASE_URL}/auth/wallet`, { headers: getHeaders() });
        if (res.ok) return await res.json();
        return null;
    } catch (err) {
        return null;
    }
};

const topUpWallet = async (amount) => {
    try {
        const res = await fetch(`${API_BASE_URL}/auth/wallet/topup`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ amount })
        });
        const data = await res.json();
        if (res.ok) {
            showToast(data.message || 'Wallet topped up', 'success');
            return data;
        }
        showToast(data.message || 'Top-up failed', 'error');
        return null;
    } catch (err) {
        showToast('Server error', 'error');
        return null;
    }
};

const getWalletTransactions = async (limit = 30) => {
    try {
        const res = await fetch(`${API_BASE_URL}/auth/wallet/transactions?limit=${limit}`, { headers: getHeaders() });
        if (res.ok) return await res.json();
        return { transactions: [] };
    } catch (err) {
        return { transactions: [] };
    }
};

const logout = () => {
    removeToken();
    window.location.href = 'login.html';
};
