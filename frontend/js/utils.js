const API_BASE_URL = '/api';

const showToast = (message, type = 'info') => {
    const toast = document.getElementById('toast');
    if (!toast) return;
    
    toast.textContent = message;
    toast.className = `fixed bottom-8 left-1/2 -translate-x-1/2 px-8 py-4 rounded-2xl shadow-2xl z-[200] text-white font-bold transition-all duration-500 transform translate-y-0 opacity-100 flex items-center gap-3 min-w-[300px] justify-center glass`;
    
    if (type === 'success') toast.classList.add('bg-green-500/90', 'border-green-400/20');
    else if (type === 'error') toast.classList.add('bg-red-500/90', 'border-red-400/20');
    else toast.classList.add('bg-slate-900/90', 'border-slate-700/20');

    toast.classList.remove('hidden');
    
    setTimeout(() => {
        toast.classList.add('translate-y-12', 'opacity-0');
        setTimeout(() => toast.classList.add('hidden'), 500);
    }, 4000);
};

const setToken = (token) => localStorage.setItem('hc_token', token);
const getToken = () => localStorage.getItem('hc_token');
const removeToken = () => localStorage.removeItem('hc_token');

const getHeaders = () => ({
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${getToken()}`
});

// Haversine formula for frontend distance checks if needed
const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return parseFloat((R * c).toFixed(2));
};

// Robust Geolocation Utility
const getCurrentLocation = (options = {}) => {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
            reject(new Error("Geolocation is not supported by your browser"));
            return;
        }

        const defaultOptions = {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0
        };

        const mergedOptions = { ...defaultOptions, ...options };

        navigator.geolocation.getCurrentPosition(
            (position) => {
                resolve({
                    lat: position.coords.latitude,
                    lng: position.coords.longitude,
                    accuracy: position.coords.accuracy
                });
            },
            (error) => {
                // If high accuracy failed, try one more time with low accuracy
                if (error.code === error.TIMEOUT && mergedOptions.enableHighAccuracy) {
                    console.warn("High accuracy timeout, trying low accuracy...");
                    navigator.geolocation.getCurrentPosition(
                        (pos) => resolve({
                            lat: pos.coords.latitude,
                            lng: pos.coords.longitude,
                            accuracy: pos.coords.accuracy
                        }),
                        (err) => reject(err),
                        { ...mergedOptions, enableHighAccuracy: false, timeout: 5000 }
                    );
                } else {
                    reject(error);
                }
            },
            mergedOptions
        );
    });
};

// Reverse Geocoding Utility using OpenStreetMap (Nominatim)
// This is a free alternative to Google Geocoding API
const reverseGeocode = async (lat, lng) => {
    try {
        const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`, {
            headers: {
                'Accept-Language': 'en-US,en;q=0.9',
                'User-Agent': 'HelpCircle-App' // Nominatim requires a User-Agent
            }
        });
        
        if (!response.ok) throw new Error('Geocoding service failed');
        
        const data = await response.json();
        const address = data.address || {};

        const cleanValue = (value = "") => value.replace(/\s+/g, ' ').trim();
        const stripSuffix = (value = "") => cleanValue(value).replace(/\s+(division|region|metropolitan area)$/i, '').trim();

        const district = cleanValue(
            address.city_district ||
            address.state_district ||
            address.district ||
            address.county ||
            address.city ||
            address.town ||
            address.municipality ||
            address.suburb ||
            address.village ||
            ""
        );

        const state = stripSuffix(
            address.state ||
            address.region ||
            address.province ||
            address.state_district ||
            address.county ||
            ""
        );

        return {
            district,
            state,
            pincode: cleanValue(address.postcode || ""),
            fullAddress: cleanValue(data.display_name || "")
        };
    } catch (err) {
        console.error("Reverse Geocoding Error:", err);
        return null;
    }
};

// Dynamically load Google Maps script
const loadGoogleMaps = async (callbackName) => {
    try {
        const res = await fetch('/api/config/google-maps');
        const { key } = await res.json();
        
        if (!key) {
            console.error("Google Maps API Key not found in server config");
            return;
        }

        const script = document.createElement('script');
        script.src = `https://maps.googleapis.com/maps/api/js?key=${key}&callback=${callbackName}&loading=async`;
        script.async = true;
        script.defer = true;
        document.head.appendChild(script);
    } catch (err) {
        console.error("Error loading Google Maps:", err);
    }
};

// Dark Mode Management
const initializeDarkMode = () => {
    const themeToggle = document.getElementById('themeToggle');
    const html = document.documentElement;
    
    // Check for saved theme preference or default to light mode
    const savedTheme = localStorage.getItem('hc_theme') || 'light';
    
    // Apply saved theme
    if (savedTheme === 'dark') {
        html.classList.add('dark');
        themeToggle?.classList.add('dark');
    } else {
        html.classList.remove('dark');
        themeToggle?.classList.remove('dark');
    }
    
    // Setup toggle button if it exists
    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            const isDark = html.classList.toggle('dark');
            localStorage.setItem('hc_theme', isDark ? 'dark' : 'light');
            
            // Update map theme if it exists
            if (typeof map !== 'undefined' && map && typeof darkStyle !== 'undefined') {
                map.setOptions({ styles: isDark ? darkStyle : [{ "featureType": "poi", "elementType": "labels", "stylers": [{ "visibility": "off" }] }] });
                
                // Update user marker stroke if it exists
                if (typeof userMarker !== 'undefined' && userMarker) {
                    userMarker.setOptions({
                        icon: {
                            ...userMarker.getIcon(),
                            strokeColor: isDark ? "#1e293b" : "#ffffff"
                        }
                    });
                }
            }
        });
    }
};

// Initialize dark mode when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeDarkMode);
} else {
    initializeDarkMode();
}
