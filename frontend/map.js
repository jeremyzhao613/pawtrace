;(function (global) {
  const DEMO_LOCATIONS = [
    {
      id: 'pawprint-cafe',
      name: 'Pawprint Café',
      type: 'Pet café & bakery',
      description: 'A sunny patio with dog-friendly treats, specialty coffee, and hydration stations for furry friends.',
      rating: '4.9 · 520 reviews',
      tags: ['Outdoor seating', 'Hydration bar', 'Slow-lane seating'],
      pets: ['Dogs welcome', 'Cat-friendly'],
      hours: '07:00 – 22:00',
      phone: '+86 512 8888 2000',
      address: 'North Gate Plaza, Taicang Campus',
      status: 'Open now',
      coords: { x: 32, y: 28 },
      link: 'https://pawtrace.demo/spot/pawprint-cafe'
    },
    {
      id: 'lucky-pet-garden',
      name: 'Lucky Pet Garden',
      type: 'Botanical walk',
      description: 'Shaded trails with fountains, cuddle benches, and plenty of bushes to sniff. Cat lovers can relax near the koi pond.',
      rating: '4.8 · 310 reviews',
      tags: ['Shaded trail', 'Koi pond', 'Quiet zone'],
      pets: ['Dogs on-leash', 'Therapy cats'],
      hours: '05:30 – 23:00',
      phone: '+86 512 8802 3301',
      address: 'East Garden Loop',
      status: 'Maintenance tomorrow 8am-10am',
      coords: { x: 57, y: 44 },
      link: 'https://pawtrace.demo/spot/lucky-pet-garden'
    },
    {
      id: 'pawfect-gear',
      name: 'Pawfect Gear Studio',
      type: 'Pet boutique',
      description: 'Local makers stock custom collars, biodegradable toys, and travel kits with campus pick-up.',
      rating: '5.0 · 118 reviews',
      tags: ['Artisan goods', 'Pickup locker'],
      pets: ['Small dogs', 'Indoor cats'],
      hours: '10:00 – 20:00',
      phone: '+86 512 8811 9876',
      address: 'Innovation Corridor, Building B',
      status: 'Members-only shopping today',
      coords: { x: 70, y: 20 },
      link: 'https://pawtrace.demo/spot/pawfect-gear'
    },
    {
      id: 'taicang-vet-lounge',
      name: 'Taicang Vet Lounge',
      type: 'Wellness clinic',
      description: 'Quick wellness checks, dental care, and behavior consultations with a calming lounge for anxious pets.',
      rating: '4.7 · 412 reviews',
      tags: ['Express exam rooms', 'Dental care'],
      pets: ['All breeds welcome'],
      hours: '09:00 – 18:00',
      phone: '+86 512 8844 2211',
      address: 'Health Sciences Row',
      status: 'Walk-ins welcome',
      coords: { x: 42, y: 66 },
      link: 'https://pawtrace.demo/spot/taicang-vet'
    }
  ];

  const MAP_ANIMALS = [
    {
      name: 'Bao',
      emoji: '🐶',
      status: 'Waiting for fetch buddies',
      coords: { x: 25, y: 62 }
    },
    {
      name: 'Mochi',
      emoji: '🐱',
      status: 'Curled up near the koi pond',
      coords: { x: 56, y: 40 }
    },
    {
      name: 'Nimbus',
      emoji: '🐶',
      status: 'Guarding the innovation corridor',
      coords: { x: 68, y: 18 }
    }
  ];

  class PawMapController {
    constructor(options = {}) {
      this.container = options.container;
      this.markersLayer = options.markersLayer;
      this.petsLayer = options.petsLayer;
      this.locationListEl = options.locationListEl;
      this.locationCountEl = options.locationCountEl;
      this.cardElements = options.cardElements || {};
      this.locationCard = this.cardElements.wrapper;
      this.activeMarker = null;
      this.locationMarkerMap = new Map();
      this.locations = DEMO_LOCATIONS;
    }

    init() {
      if (!this.container) return;
      this.renderMarkers();
      this.renderLocationList();
      this.renderAnimals();
      this.attachCardHandlers();
      this.updateLocationCount();
      if (this.locations.length) {
        this.showLocationCard(this.locations[0]);
      }
    }

    renderMarkers() {
      if (!this.markersLayer) return;
      this.markersLayer.innerHTML = '';
      this.locationMarkerMap.clear();
      this.locations.forEach(location => {
        const marker = document.createElement('button');
        marker.type = 'button';
        marker.className = 'map-marker';
        marker.style.left = `${location.coords?.x ?? 50}%`;
        marker.style.top = `${location.coords?.y ?? 50}%`;
        marker.innerHTML = '<span aria-hidden="true">🐾</span>';
        marker.addEventListener('click', () => this.showLocationCard(location, marker));
        this.markersLayer.appendChild(marker);
        this.locationMarkerMap.set(location.id, marker);
      });
    }

    renderLocationList() {
      if (!this.locationListEl) return;
      this.locationListEl.innerHTML = '';
      this.locations.forEach(location => {
        const entry = document.createElement('button');
        entry.type = 'button';
        entry.className = 'w-full text-left px-3 py-2 rounded-xl border border-white/20 hover:border-primary/60 transition-colors text-[11px] text-slate-700 bg-white/70 font-medium flex flex-col gap-1';
        entry.innerHTML = `
          <span class="flex items-center justify-between">
            <span class="font-semibold text-sm text-slate-900">${location.name}</span>
            <span class="text-[10px] text-gray-500">${location.rating}</span>
          </span>
          <span class="text-[10px] text-gray-500">${location.type}</span>
        `;
        entry.addEventListener('click', () => this.showLocationCard(location));
        this.locationListEl.appendChild(entry);
      });
    }

    renderAnimals() {
      if (!this.petsLayer) return;
      this.petsLayer.innerHTML = '';
      MAP_ANIMALS.forEach(record => {
        const node = document.createElement('div');
        node.className = 'map-pet';
        node.style.left = `${record.coords?.x ?? 50}%`;
        node.style.top = `${record.coords?.y ?? 50}%`;
        node.title = `${record.name} · ${record.status}`;
        node.innerHTML = `
          <span class="map-pet-circle">${record.emoji}</span>
          <span class="map-pet-name">${record.name}</span>
        `;
        this.petsLayer.appendChild(node);
      });
    }

    attachCardHandlers() {
      if (this.cardElements.closeButton) {
        this.cardElements.closeButton.addEventListener('click', () => this.hideLocationCard());
      }
    }

    showLocationCard(location, marker) {
      if (!location || !this.cardElements.name) return;
      const markerNode = marker || this.locationMarkerMap.get(location.id);
      if (this.activeMarker) {
        this.activeMarker.classList.remove('map-marker--active');
      }
      if (markerNode) {
        markerNode.classList.add('map-marker--active');
        this.activeMarker = markerNode;
      }
      if (this.locationCard) {
        this.locationCard.classList.remove('hidden');
      }
      this.cardElements.name.textContent = location.name;
      this.cardElements.type.textContent = location.type;
      this.cardElements.desc.textContent = location.description;
      this.cardElements.rating.textContent = location.rating ? `⭐ ${location.rating}` : '';
      this.cardElements.hours.textContent = location.hours || 'Hours not listed';
      this.cardElements.phone.textContent = location.phone || 'No phone listed';
      this.cardElements.address.textContent = location.address || '';
      this.cardElements.status.textContent = location.status || '';
      this.cardElements.tags.innerHTML = (location.tags || [])
        .map(tag => `<span class="location-tag">${tag}</span>`)
        .join('');
      this.cardElements.pets.innerHTML = (location.pets || [])
        .map(pet => `<span class="location-tag" style="background: rgba(59, 130, 246, 0.2);">${pet}</span>`)
        .join('');
      this.setLink(location.link);
    }

    hideLocationCard() {
      if (this.locationCard) {
        this.locationCard.classList.add('hidden');
      }
      if (this.activeMarker) {
        this.activeMarker.classList.remove('map-marker--active');
        this.activeMarker = null;
      }
      this.disableLinkButton();
    }

    setLink(url) {
      const linkButton = this.cardElements.linkButton;
      if (!linkButton) return;
      if (url) {
        linkButton.disabled = false;
        linkButton.classList.remove('opacity-40', 'cursor-not-allowed');
        linkButton.onclick = () => window.open(url, '_blank');
      } else {
        this.disableLinkButton();
      }
    }

    disableLinkButton() {
      const linkButton = this.cardElements.linkButton;
      if (!linkButton) return;
      linkButton.disabled = true;
      linkButton.classList.add('opacity-40', 'cursor-not-allowed');
      linkButton.onclick = null;
    }

    updateLocationCount() {
      if (!this.locationCountEl) return;
      this.locationCountEl.textContent = `${this.locations.length} spots`;
    }
  }

  global.PawMapController = PawMapController;
})(window);
