let map;
let markers = [];
let userMarker;
let infoWindow;

const darkStyle = [
    { "elementType": "geometry", "stylers": [{ "color": "#1e293b" }] },
    { "elementType": "labels.text.stroke", "stylers": [{ "color": "#1e293b" }] },
    { "elementType": "labels.text.fill", "stylers": [{ "color": "#64748b" }] },
    { "featureType": "administrative.locality", "elementType": "labels.text.fill", "stylers": [{ "color": "#94a3b8" }] },
    { "featureType": "poi", "elementType": "labels.text.fill", "stylers": [{ "color": "#94a3b8" }] },
    { "featureType": "poi.park", "elementType": "geometry", "stylers": [{ "color": "#0f172a" }] },
    { "featureType": "poi.park", "elementType": "labels.text.fill", "stylers": [{ "color": "#475569" }] },
    { "featureType": "road", "elementType": "geometry", "stylers": [{ "color": "#334155" }] },
    { "featureType": "road", "elementType": "geometry.stroke", "stylers": [{ "color": "#1e293b" }] },
    { "featureType": "road", "elementType": "labels.text.fill", "stylers": [{ "color": "#94a3b8" }] },
    { "featureType": "road.highway", "elementType": "geometry", "stylers": [{ "color": "#475569" }] },
    { "featureType": "road.highway", "elementType": "geometry.stroke", "stylers": [{ "color": "#1e293b" }] },
    { "featureType": "road.highway", "elementType": "labels.text.fill", "stylers": [{ "color": "#e2e8f0" }] },
    { "featureType": "transit", "elementType": "geometry", "stylers": [{ "color": "#1e293b" }] },
    { "featureType": "transit.station", "elementType": "labels.text.fill", "stylers": [{ "color": "#94a3b8" }] },
    { "featureType": "water", "elementType": "geometry", "stylers": [{ "color": "#020617" }] },
    { "featureType": "water", "elementType": "labels.text.fill", "stylers": [{ "color": "#334155" }] },
    { "featureType": "water", "elementType": "labels.text.stroke", "stylers": [{ "color": "#020617" }] },
    { "featureType": "poi", "elementType": "labels", "stylers": [{ "visibility": "off" }] }
];

function initMap() {
    // Initial center (will be updated)
    const initialPos = { lat: 28.6139, lng: 77.2090 }; // Delhi
    const isDark = document.documentElement.classList.contains('dark');
    
    map = new google.maps.Map(document.getElementById('map'), {
        zoom: 14,
        center: initialPos,
        disableDefaultUI: true,
        styles: isDark ? darkStyle : [{ "featureType": "poi", "elementType": "labels", "stylers": [{ "visibility": "off" }] }]
    });

    infoWindow = new google.maps.InfoWindow();

    // Get user location and load feed
    getCurrentLocation()
        .then(async (pos) => {
            map.setCenter(pos);
            
            // Try to get area name for UI
            reverseGeocode(pos.lat, pos.lng).then(addr => {
                const areaText = document.getElementById('currentAreaText');
                if (areaText && addr) {
                    areaText.textContent = `${addr.district}, ${addr.state}`;
                }
            });

            // Blue user marker
            userMarker = new google.maps.Marker({
                position: pos,
                map: map,
                icon: {
                    path: google.maps.SymbolPath.CIRCLE,
                    scale: 12,
                    fillColor: "#3b82f6",
                    fillOpacity: 1,
                    strokeWeight: 4,
                    strokeColor: "#ffffff",
                },
                title: "Your Location"
            });

            // Fetch and display nearby posts
            const posts = await getFeed(pos.lat, pos.lng);
            displayPostsOnMap(posts);

            // Also trigger feed rendering in main.js
            if (window.renderFeed) {
                window.renderFeed(posts);
            }
        })
        .catch((error) => {
            console.error("Geolocation failed:", error);
            showToast("Location access denied or failed. Feed may not be accurate.", "error");
            
            // Fallback: If geolocation fails, load feed with default location (Delhi)
            getFeed(initialPos.lat, initialPos.lng).then(posts => {
                displayPostsOnMap(posts);
                if (window.renderFeed) window.renderFeed(posts);
            });

        })
        .finally(() => {
            const loader = document.getElementById('mapLoader');
            if (loader) {
                loader.classList.add('opacity-0');
                setTimeout(() => loader.classList.add('hidden'), 500);
            }
        });
}

function displayPostsOnMap(posts) {
    // Clear existing markers
    markers.forEach(m => m.setMap(null));
    markers = [];

    posts.forEach(post => {
        const marker = new google.maps.Marker({
            position: { lat: post.lat, lng: post.lng },
            map: map,
            icon: {
                path: "M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z",
                fillColor: post.isUrgent ? "#ef4444" : "#f97316",
                fillOpacity: 1,
                strokeWeight: 1,
                strokeColor: "#ffffff",
                scale: 1.5,
                anchor: new google.maps.Point(12, 24)
            },
            title: post.title
        });

        marker.addListener("click", () => {
            const content = `
                <div class="p-2 max-w-[200px]">
                    <h4 class="font-bold text-gray-800 text-sm mb-1">${post.title}</h4>
                    <p class="text-xs text-gray-500 mb-2">${post.distance} km away</p>
                    <button onclick="scrollToPost('${post._id}')" class="text-xs font-bold text-orange-600 hover:underline">View Post</button>
                </div>
            `;
            infoWindow.setContent(content);
            infoWindow.open(map, marker);
        });

        markers.push(marker);
    });
}

function scrollToPost(postId) {
    const el = document.getElementById(`post-${postId}`);
    if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('ring-4', 'ring-orange-500/30');
        setTimeout(() => el.classList.remove('ring-4', 'ring-orange-500/30'), 2000);
    }
}
