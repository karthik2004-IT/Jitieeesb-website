$(document).ready(function(){
  // --- Firebase Configuration --- //
  const firebaseConfig = {
    apiKey: "AIzaSyDBmO1GZ_CZR11yxQPmpslvddnrLezoOHk",
    authDomain: "jit-ieee-sb.firebaseapp.com",
    projectId: "jit-ieee-sb",
    storageBucket: "jit-ieee-sb.firebasestorage.app",
    messagingSenderId: "448155721091",
    appId: "1:448155721091:web:455202d37a37283cdb6ab6",
    measurementId: "G-PFHMGB05NX"
  };

  // Initialize Firebase safely
  if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
    if (typeof firebase.analytics === 'function') {
      firebase.analytics();
    }
  }
  const db = firebase.database();

  // --- XSS Sanitization Helper --- //
  function sanitize(str) {
    if (typeof str !== 'string') return '';
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  // --- Utility: Empty check --- //
  function isEmpty(arr) {
    return !arr || arr.length === 0;
  }

  // Initialize Slick Slider
  const heroSlider = $('.hero-slider');
  if (heroSlider.length && typeof $.fn.slick === 'function') {
    heroSlider.slick({
      dots: true,
      infinite: true,
      speed: 800,
      fade: true,
      cssEase: 'linear',
      autoplay: true,
      autoplaySpeed: 5000,
      arrows: false,
      pauseOnHover: false
    });
  }

  // Dynamic Year
  $('#year').text(new Date().getFullYear());

  // Smooth Scrolling with safety check
  $('a.nav-link').on('click', function(event) {
    if (this.hash !== "") {
      const target = $(this.hash);
      if (target.length) {
          event.preventDefault();
          $('html, body').animate({
            scrollTop: target.offset().top - 70 
          }, 800);
      }
    }
  });

  // --- Data Management --- //
  const defaultEvents = [{
    id: 1, day: "15", month: "Oct", time: "10:00 AM", location: "Auditorium",
    title: "Upcoming Event", desc: "Stay tuned for our next big event!", poster: ""
  }];

  let storedEvents = defaultEvents;
  let storedTeam = [];
  let storedAchievements = [];
  let storedGallery = [];
  let storedNewsletters = [];

  // Local Storage Cache
  try {
    const lEv = JSON.parse(localStorage.getItem('ieee_events'));
    const lTeam = JSON.parse(localStorage.getItem('ieee_team'));
    const lAch = JSON.parse(localStorage.getItem('ieee_achievements'));
    const lGal = JSON.parse(localStorage.getItem('ieee_gallery'));
    const lNl = JSON.parse(localStorage.getItem('ieee_newsletters'));
    
    if (!isEmpty(lEv)) storedEvents = lEv;
    if (!isEmpty(lTeam)) storedTeam = lTeam;
    if (!isEmpty(lAch)) storedAchievements = lAch;
    if (!isEmpty(lGal)) storedGallery = lGal;
    if (!isEmpty(lNl)) storedNewsletters = lNl;
  } catch(e) { console.warn("Cache load failed."); }

  function toArray(data) {
    if (!data) return [];
    if (Array.isArray(data)) return data;
    return Object.values(data);
  }

  // Real-time Cloud Sync
  db.ref('/').on('value', (snapshot) => {
    const data = snapshot.val();
    if (data) {
        storedEvents = data.events ? toArray(data.events) : storedEvents;
        storedTeam = data.team ? toArray(data.team) : storedTeam;
        storedAchievements = data.achievements ? toArray(data.achievements) : storedAchievements;
        storedGallery = data.gallery ? toArray(data.gallery) : storedGallery;
        storedNewsletters = data.newsletters ? toArray(data.newsletters) : storedNewsletters;
        storedNewsletters = data.newsletters ? toArray(data.newsletters) : storedNewsletters;
        
        // Cache to storage
        localStorage.setItem('ieee_events', JSON.stringify(storedEvents));
        localStorage.setItem('ieee_team', JSON.stringify(storedTeam));
        localStorage.setItem('ieee_achievements', JSON.stringify(storedAchievements));
        localStorage.setItem('ieee_gallery', JSON.stringify(storedGallery));
        localStorage.setItem('ieee_newsletters', JSON.stringify(storedNewsletters));
        localStorage.setItem('ieee_newsletters', JSON.stringify(storedNewsletters));
        
        renderAll();
    }
  });

  function renderAll() {
    renderEvents();
    renderTeam();
    renderAchievements();
    renderGallery();
    renderNewsletters();
    renderNewsletters();
  }

  function renderGallery() {
    const container = $('#galleryContainer');
    if (!container.length) return;
    container.empty();
    const items = storedGallery.slice(0, 6);
    if (isEmpty(items)) {
        container.append('<div class="col-12 text-center text-white-50 p-5">Coming Soon.</div>');
        return;
    }
    items.forEach(g => {
      container.append(`
        <div class="col-lg-4 col-md-6">
            <div class="gallery-item">
                <img src="${g.image}" alt="Gallery" class="img-fluid">
                <div class="gallery-overlay"><p>${sanitize(g.desc)}</p></div>
            </div>
        </div>
      `);
    });
  }

  function renderNewsletters() {
    const container = $('#newsletterContainer');
    if (!container.length) return;
    container.empty();
    storedNewsletters.forEach(nl => {
      container.append(`
        <div class="col-md-3 col-6 mb-4">
            <a href="${sanitize(nl.link)}" target="_blank" class="newsletter-release-link">
              <div class="newsletter-release-card p-0 overflow-hidden">
                  <img src="${nl.cover || ''}" alt="${sanitize(nl.title)}" class="img-fluid newsletter-cover" onerror="this.src='jit ieee sb logo.png'">
                  <div class="newsletter-info-overlay"><h6>${sanitize(nl.title)}</h6><span class="btn btn-ieee btn-sm">Read Now</span></div>
              </div>
            </a>
        </div>
      `);
    });
  }

  function renderAchievements() {
    const containers = [$('#achievementsContainer'), $('#achievementsHomeContainer')];
    containers.forEach(container => {
        if (!container.length) return;
        container.empty();
        const limit = container.attr('id') === 'achievementsHomeContainer' ? 3 : 100;
        storedAchievements.slice(0, limit).forEach(ach => {
            container.append(`
                <div class="col-lg-4 col-md-6 mb-4">
                    <div class="achievement-card">
                        <img src="${ach.image || 'jit ieee group pic.jpeg'}" class="achievement-img" onerror="this.src='jit ieee group pic.jpeg'">
                        <div class="achievement-content">
                            <span class="achievement-tag">${sanitize(ach.category || 'Award')}</span>
                            <span class="achievement-year">${sanitize(ach.year)}</span>
                            <h4 class="achievement-title">${sanitize(ach.title)}</h4>
                            <p class="achievement-desc">${sanitize(ach.desc)}</p>
                        </div>
                    </div>
                </div>
            `);
        });
    });
  }

  function renderEvents() {
    const container = $('#eventsContainer');
    if (!container.length || isEmpty(storedEvents)) return;
    container.empty();
    storedEvents.forEach((ev, i) => {
      container.append(`
        <div class="col-md-4 mb-4">
            <div class="event-card">
                <div class="event-date"><span class="day">${sanitize(ev.day)}</span><span class="month">${sanitize(ev.month)}</span></div>
                <div class="event-info">
                    <div class="event-meta"><span><i class="far fa-clock"></i> ${sanitize(ev.time)}</span><br><span><i class="fas fa-map-marker-alt"></i> ${sanitize(ev.location)}</span></div>
                    <h4>${sanitize(ev.title)}</h4>
                    <p>${sanitize(ev.desc)}</p>
                    <div class="d-flex justify-content-between align-items-center">
                      <a href="javascript:void(0)" class="read-more" onclick="showEventDetails(${i})">Details <i class="fas fa-angle-right"></i></a>
                      ${ev.regLink ? `<a href="${sanitize(ev.regLink)}" target="_blank" class="btn btn-ieee btn-sm">Join</a>` : ''}
                    </div>
                </div>
            </div>
        </div>
      `);
    });
    
    // Auto-popup for latest event
    if (storedEvents[0].poster && !sessionStorage.getItem('ieee_popup_shown') && $('#eventPosterModal').length) {
        $('#popupImage').attr('src', storedEvents[0].poster);
        const modal = new bootstrap.Modal(document.getElementById('eventPosterModal'));
        setTimeout(() => { modal.show(); sessionStorage.setItem('ieee_popup_shown', 'true'); }, 1500);
    }
  }

  window.showEventDetails = function(i) {
    const ev = storedEvents[i];
    if (!ev) return;
    $('#eventDetailMainTitle').text(ev.title);
    $('#eventDetailDate').text(`${ev.day} ${ev.month}`);
    $('#eventDetailTime').text(ev.time);
    $('#eventDetailLocation').text(ev.location);
    $('#eventDetailDescription').text(ev.desc);
    if (ev.poster) { $('#eventDetailPoster').attr('src', ev.poster).parent().show(); }
    else { $('#eventDetailPoster').parent().hide(); }
    if (ev.regLink) { $('#eventDetailRegLink').attr('href', ev.regLink).show(); }
    else { $('#eventDetailRegLink').hide(); }
    new bootstrap.Modal(document.getElementById('eventDetailModal')).show();
  };

  function renderTeam() {
    const container = $('#teamContainer');
    if (!container.length) return;
    container.empty();
    storedTeam.forEach(m => {
      container.append(`
        <div class="col-lg-3 col-md-6">
            <div class="team-member">
                <img src="${m.photo || 'jit ieee sb logo.png'}" class="team-img" onerror="this.src='jit ieee sb logo.png'">
                <h4 class="team-name">${sanitize(m.name)}</h4>
                <p class="team-role">${sanitize(m.role)}</p>
                <div class="team-social">
                    ${m.linkedin ? `<a href="${sanitize(m.linkedin)}" target="_blank"><i class="fab fa-linkedin"></i></a>` : ''}
                    <a href="mailto:ieeejitsb@gmail.com"><i class="fas fa-envelope"></i></a>
                </div>
            </div>
        </div>
      `);
    });
  }


  function isEmpty(arr) {
    return !arr || arr.length === 0;
  }
});

