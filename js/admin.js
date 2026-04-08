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

    if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
    }
    const db = firebase.database();

    // --- Security Constants --- //
    const MAX_FILE_SIZE_MB = 2;
    const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
    const MAX_LOGIN_ATTEMPTS = 5;
    const LOCKOUT_DURATION_MS = 5 * 60 * 1000; // 5 minutes

    // --- Anti-Loop Flag --- //
    let _isSyncing = false;

    // --- Global Data Arrays --- //
    let storedEvents = [];
    let storedTeam = [];
    let storedAchievements = [];
    let adminUsers = [];
    let gallery = [];
    let newsletters = [];
    let editingItem = null; // { type: 'events|team|achievements|awardees|newsletters|gallery', index: number }

    // --- XSS Sanitization --- //
    function sanitize(str) {
        if (typeof str !== 'string') return '';
        const div = document.createElement('div');
        div.appendChild(document.createTextNode(str));
        return div.innerHTML;
    }

    // --- Rate Limiting for Login --- //
    let loginAttempts = 0;
    let lockoutUntil = 0;

    function isLockedOut() {
        if (Date.now() < lockoutUntil) {
            const remainingMs = lockoutUntil - Date.now();
            const remainingMin = Math.ceil(remainingMs / 60000);
            return remainingMin;
        }
        return 0;
    }

    // --- Password Hashing (SHA-256) --- //
    async function hashPassword(password) {
        const encoder = new TextEncoder();
        const data = encoder.encode(password);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }

    // --- Authorization Logic --- //
    // Hardcoded fallback hash for "JITIEEE@Admin"
    const FALLBACK_EMAIL = "ieeejitsb@gmail.com";
    let FALLBACK_HASH = "";
    // Precompute fallback hash
    hashPassword("JITIEEE@Admin").then(h => { FALLBACK_HASH = h; });

    function checkAuth() {
        const userEmail = sessionStorage.getItem('ieee_admin_email');
        const userPassHash = sessionStorage.getItem('ieee_admin_pass_hash');

        if (!userEmail || !userPassHash) {
            $('#adminContent').hide();
            $('#authOverlay').show();
            return;
        }

        if (userEmail === FALLBACK_EMAIL && userPassHash === FALLBACK_HASH) {
            showDashboard();
            return;
        }

        const validAdmin = adminUsers.find(u => u.email === userEmail && u.passwordHash === userPassHash);
        if (validAdmin) {
            showDashboard();
        } else {
            $('#adminContent').hide();
            $('#authOverlay').show();
        }
    }

    function showDashboard() {
        $('#authOverlay').hide();
        $('#adminContent').fadeIn();
    }

    $('#adminLoginForm').on('submit', async function(e) {
        e.preventDefault();

        // Check lockout
        const lockedMin = isLockedOut();
        if (lockedMin > 0) {
            $('#loginError').text(`Too many failed attempts. Try again in ${lockedMin} minute(s).`).show();
            return;
        }

        const email = sanitize($('#adminEmail').val().toLowerCase().trim());
        const pass = $('#adminPass').val();
        const passHash = await hashPassword(pass);

        const isFallback = (email === FALLBACK_EMAIL && passHash === FALLBACK_HASH);
        const isDynamic = adminUsers.find(u => u.email === email && u.passwordHash === passHash);

        if (isFallback || isDynamic) {
            loginAttempts = 0;
            sessionStorage.setItem('ieee_admin_email', email);
            sessionStorage.setItem('ieee_admin_pass_hash', passHash);
            $('#loginError').hide();
            checkAuth();
        } else {
            loginAttempts++;
            if (loginAttempts >= MAX_LOGIN_ATTEMPTS) {
                lockoutUntil = Date.now() + LOCKOUT_DURATION_MS;
                loginAttempts = 0;
                $('#loginError').text('Account locked for 5 minutes due to too many failed attempts.').show();
            } else {
                const remaining = MAX_LOGIN_ATTEMPTS - loginAttempts;
                $('#loginError').text(`Invalid email or password. ${remaining} attempt(s) remaining.`).show();
            }
        }
    });

    $('#logoutBtn').on('click', function() {
        sessionStorage.removeItem('ieee_admin_email');
        sessionStorage.removeItem('ieee_admin_pass_hash');
        location.reload();
    });

    // --- Database Operations --- //
    function fetchAll() {
        // Use 'on' for real-time updates but guard against sync loops
        db.ref('/').on('value', (snapshot) => {
            // Skip re-processing if we just wrote data
            if (_isSyncing) return;

            const data = snapshot.val() || {};
            storedEvents = toArray(data.events);
            storedTeam = toArray(data.team);
            storedAchievements = toArray(data.achievements);
            adminUsers = toArray(data.admins);
            gallery = toArray(data.gallery);
            newsletters = toArray(data.newsletters);
            awardees = toArray(data.awardees);
            
            renderAdminEvents();
            renderAdminTeam();
            renderAdminAchievements();
            renderAdminUsers();
            renderAdminGallery();
            renderAdminNewsletters();
            checkAuth(); 
        }, (error) => {
            console.error("Firebase fetch error:", error);
        });
    }

    function toArray(data) {
        if (!data) return [];
        if (Array.isArray(data)) return data;
        return Object.values(data);
    }

    function sync() {
        _isSyncing = true;
        db.ref('/').set({
            events: storedEvents,
            team: storedTeam,
            achievements: storedAchievements,
            admins: adminUsers,
            gallery: gallery,
            newsletters: newsletters
        }).then(() => {
            console.log("Database Sync Successful");
            // Reset the flag after a brief delay to allow the listener to fire and skip
            setTimeout(() => { _isSyncing = false; }, 500);
        }).catch((error) => {
            console.error("Database Sync Failed:", error);
            _isSyncing = false;
            alert("Error: Database sync failed. Please check your Firebase rules/connection.\n" + error.message);
        });
    }

    // --- File Validation --- //
    function validateFile(file) {
        if (!file) return { valid: false, error: "No file selected." };
        if (file.size > MAX_FILE_SIZE_BYTES) {
            return { valid: false, error: `File too large. Maximum size is ${MAX_FILE_SIZE_MB}MB. Your file: ${(file.size / (1024 * 1024)).toFixed(1)}MB` };
        }
        const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
        if (!allowedTypes.includes(file.type)) {
            return { valid: false, error: "Invalid file type. Allowed: JPEG, PNG, GIF, WebP." };
        }
        return { valid: true };
    }

    // --- Gallery Management --- //
    $('#addGalleryForm').on('submit', async function(e) {
        e.preventDefault();
        const file = $('#galImageFile')[0].files[0];
        let imgBase64 = editingItem && editingItem.type === 'gallery' ? gallery[editingItem.index].image : "";
        
        if (file) {
            const check = validateFile(file);
            if (!check.valid) { alert(check.error); return; }
            imgBase64 = await fileToBase64(file);
        } else if (!imgBase64) {
            alert("Image is required for gallery items.");
            return;
        }
        
        const data = {
            id: editingItem && editingItem.type === 'gallery' ? gallery[editingItem.index].id : Date.now(),
            image: imgBase64,
            desc: sanitize($('#galDesc').val())
        };

        if (editingItem && editingItem.type === 'gallery') {
            gallery[editingItem.index] = data;
            resetEdit('gallery');
        } else {
            gallery.unshift(data);
        }
        
        sync();
        this.reset();
        renderAdminGallery();
    });

    function renderAdminGallery() {
        const list = $('#adminGalleryList');
        list.empty();
        gallery.forEach((g, index) => {
            const li = $('<li></li>', { class: 'list-group-item d-flex justify-content-between align-items-center' }).text(g.desc + ' ');
            const btnGroup = $('<div class="btn-group"></div>');
            const editBtn = $('<button class="btn btn-warning btn-sm me-2">Edit</button>');
            editBtn.on('click', function() { startEdit('gallery', index); });
            const delBtn = $('<button class="btn btn-danger btn-sm">Delete</button>');
            delBtn.on('click', function() { deleteGallery(index); });
            btnGroup.append(editBtn).append(delBtn);
            li.append(btnGroup);
            list.append(li);
        });
    }

    function deleteGallery(i) {
        if (!confirm("Delete this gallery item?")) return;
        gallery.splice(i, 1);
        sync();
        renderAdminGallery();
    }

    // --- Newsletter Management --- //
    $('#addLetterForm').on('submit', async function(e) {
        e.preventDefault();
        const file = $('#nlCoverFile')[0].files[0];
        let coverBase64 = editingItem && editingItem.type === 'newsletters' ? newsletters[editingItem.index].cover : "";
        if (file) {
            const check = validateFile(file);
            if (!check.valid) { alert(check.error); return; }
            coverBase64 = await fileToBase64(file);
        }

        const data = {
            id: editingItem && editingItem.type === 'newsletters' ? newsletters[editingItem.index].id : Date.now(),
            title: sanitize($('#nlTitle').val()),
            link: sanitize($('#nlLink').val()),
            cover: coverBase64
        };

        if (editingItem && editingItem.type === 'newsletters') {
            newsletters[editingItem.index] = data;
            resetEdit('newsletters');
        } else {
            newsletters.unshift(data);
        }
        
        sync();
        this.reset();
        renderAdminNewsletters();
    });

    function renderAdminNewsletters() {
        const list = $('#adminNewsletterList');
        list.empty();
        newsletters.forEach((nl, index) => {
            const li = $('<li></li>', { class: 'list-group-item d-flex justify-content-between align-items-center' }).text(nl.title + ' ');
            const btnGroup = $('<div class="btn-group"></div>');
            const editBtn = $('<button class="btn btn-warning btn-sm me-2">Edit</button>');
            editBtn.on('click', function() { startEdit('newsletters', index); });
            const delBtn = $('<button class="btn btn-danger btn-sm">Delete</button>');
            delBtn.on('click', function() { deleteNewsletter(index); });
            btnGroup.append(editBtn).append(delBtn);
            li.append(btnGroup);
            list.append(li);
        });
    }

    function deleteNewsletter(i) {
        if (!confirm("Delete this newsletter?")) return;
        newsletters.splice(i, 1);
        sync();
        renderAdminNewsletters();
    }


    function startEdit(type, index) {
        editingItem = { type, index };
        let item;
        const form = getFormByType(type);
        const submitBtn = form.find('button[type="submit"]');
        submitBtn.text('Update Item').removeClass('btn-ieee').addClass('btn-warning');
        
        switch(type) {
            case 'events': item = storedEvents[index]; $('#evTitle').val(item.title); $('#evDay').val(item.day); $('#evMonth').val(item.month); $('#evTime').val(item.time); $('#evLocation').val(item.location); $('#evRegLink').val(item.regLink); $('#evDesc').val(item.desc); break;
            case 'team': item = storedTeam[index]; $('#tmName').val(item.name); $('#tmRole').val(item.role); $('#tmLinkedIn').val(item.linkedin); break;
            case 'achievements': item = storedAchievements[index]; $('#achTitle').val(item.title); $('#achYear').val(item.year); $('#achCategory').val(item.category); $('#achDesc').val(item.desc); break;
            case 'newsletters': item = newsletters[index]; $('#nlTitle').val(item.title); $('#nlLink').val(item.link); break;
            case 'gallery': item = gallery[index]; $('#galDesc').val(item.desc); break;
        }
        
        // Scroll to form
        form[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    function getFormByType(type) {
        switch(type) {
            case 'events': return $('#addEventForm');
            case 'team': return $('#addTeamForm');
            case 'achievements': return $('#addAchievementForm');
            case 'newsletters': return $('#addNewsletterForm');
            case 'gallery': return $('#addGalleryForm');
        }
    }

    function resetEdit(type) {
        editingItem = null;
        const form = getFormByType(type);
        form.find('button[type="submit"]').text('Add New').removeClass('btn-warning').addClass('btn-ieee');
    }


    // --- Events, Team, Achievements Form Management --- //
    $('#addEventForm').on('submit', async function(e) {
        e.preventDefault();
        const file = $('#evPosterFile')[0].files[0];
        let posterBase64 = editingItem && editingItem.type === 'events' ? storedEvents[editingItem.index].poster : "";
        if (file) {
            const check = validateFile(file);
            if (!check.valid) { alert(check.error); return; }
            posterBase64 = await fileToBase64(file);
        }

        const data = {
            id: editingItem && editingItem.type === 'events' ? storedEvents[editingItem.index].id : Date.now(),
            title: sanitize($('#evTitle').val()),
            day: sanitize($('#evDay').val()),
            month: sanitize($('#evMonth').val()),
            time: sanitize($('#evTime').val()),
            location: sanitize($('#evLocation').val()),
            regLink: sanitize($('#evRegLink').val()),
            desc: sanitize($('#evDesc').val()),
            poster: posterBase64
        };

        if (editingItem && editingItem.type === 'events') {
            storedEvents[editingItem.index] = data;
            resetEdit('events');
        } else {
            storedEvents.unshift(data);
        }
        
        sync();
        this.reset();
        renderAdminEvents();
    });

    $('#addTeamForm').on('submit', async function(e) {
        e.preventDefault();
        const file = $('#tmPhotoFile')[0].files[0];
        let photoBase64 = editingItem && editingItem.type === 'team' ? storedTeam[editingItem.index].photo : "";
        if (file) {
            const check = validateFile(file);
            if (!check.valid) { alert(check.error); return; }
            photoBase64 = await fileToBase64(file);
        } else if (!photoBase64) {
            alert("Photo is required for new team members.");
            return;
        }

        const data = {
            id: editingItem && editingItem.type === 'team' ? storedTeam[editingItem.index].id : Date.now(),
            name: sanitize($('#tmName').val()),
            role: sanitize($('#tmRole').val()),
            linkedin: sanitize($('#tmLinkedIn').val()),
            photo: photoBase64
        };

        if (editingItem && editingItem.type === 'team') {
            storedTeam[editingItem.index] = data;
            resetEdit('team');
        } else {
            storedTeam.push(data);
        }
        sync();
        this.reset();
        renderAdminTeam();
    });

    $('#addAchievementForm').on('submit', async function(e) {
        e.preventDefault();
        const file = $('#achImageFile')[0].files[0];
        let imageBase64 = editingItem && editingItem.type === 'achievements' ? storedAchievements[editingItem.index].image : "";
        if (file) {
            const check = validateFile(file);
            if (!check.valid) { alert(check.error); return; }
            imageBase64 = await fileToBase64(file);
        } else if (!imageBase64) {
            alert("Image is required for achievements.");
            return;
        }

        const data = {
            id: editingItem && editingItem.type === 'achievements' ? storedAchievements[editingItem.index].id : Date.now(),
            title: sanitize($('#achTitle').val()),
            year: sanitize($('#achYear').val()),
            category: sanitize($('#achCategory').val()),
            desc: sanitize($('#achDesc').val()),
            image: imageBase64
        };

        if (editingItem && editingItem.type === 'achievements') {
            storedAchievements[editingItem.index] = data;
            resetEdit('achievements');
        } else {
            storedAchievements.unshift(data);
        }
        sync();
        this.reset();
        renderAdminAchievements();
    });

    // --- Admin User Management --- //
    $('#addUserForm').on('submit', async function(e) {
        e.preventDefault();
        const email = sanitize($('#newUserEmail').val().toLowerCase().trim());
        const password = $('#newUserPass').val();

        // Validate password strength
        if (password.length < 8) {
            alert("Password must be at least 8 characters long.");
            return;
        }

        if (adminUsers.some(u => u.email === email)) {
            alert("This email is already an admin.");
            return;
        }

        const passHash = await hashPassword(password);
        adminUsers.push({ id: Date.now(), email: email, passwordHash: passHash });
        sync();
        this.reset();
        renderAdminUsers();
    });

    function renderAdminUsers() {
        const list = $('#adminUsersList');
        list.empty();
        adminUsers.forEach((u, index) => {
            const tr = $('<tr></tr>');
            tr.append($('<td></td>').text(u.email));
            const btn = $('<button class="btn btn-danger btn-sm">Delete</button>');
            btn.on('click', function() { deleteAdmin(index); });
            const td = $('<td></td>').append(btn);
            tr.append(td);
            list.append(tr);
        });
    }

    function deleteAdmin(index) {
        if (confirm("Are you sure you want to remove this admin?")) {
            adminUsers.splice(index, 1);
            sync();
            renderAdminUsers();
        }
    }

    // --- Events, Team, Achievements Rendering (Simplified for Admin view) --- //
    function renderAdminEvents() {
        const list = $('#adminEventsList');
        list.empty();
        storedEvents.forEach((ev, i) => {
            const li = $('<li></li>', { class: 'list-group-item d-flex justify-content-between align-items-center' }).text(ev.title + ' ');
            const btnGroup = $('<div class="btn-group"></div>');
            const editBtn = $('<button class="btn btn-warning btn-sm me-2">Edit</button>');
            editBtn.on('click', function() { startEdit('events', i); });
            const delBtn = $('<button class="btn btn-danger btn-sm">Delete</button>');
            delBtn.on('click', function() { deleteEvent(i); });
            btnGroup.append(editBtn).append(delBtn);
            li.append(btnGroup);
            list.append(li);
        });
    }

    function deleteEvent(i) {
        if (!confirm("Delete this event?")) return;
        storedEvents.splice(i, 1);
        sync();
        renderAdminEvents();
    }

    function renderAdminTeam() {
        const list = $('#adminTeamList');
        list.empty();
        storedTeam.forEach((tm, i) => {
            const li = $('<li></li>', { class: 'list-group-item d-flex justify-content-between align-items-center' }).text(tm.name + ' ');
            const btnGroup = $('<div class="btn-group"></div>');
            const editBtn = $('<button class="btn btn-warning btn-sm me-2">Edit</button>');
            editBtn.on('click', function() { startEdit('team', i); });
            const delBtn = $('<button class="btn btn-danger btn-sm">Delete</button>');
            delBtn.on('click', function() { deleteTeam(i); });
            btnGroup.append(editBtn).append(delBtn);
            li.append(btnGroup);
            list.append(li);
        });
    }

    function deleteTeam(i) {
        if (!confirm("Delete this team member?")) return;
        storedTeam.splice(i, 1);
        sync();
        renderAdminTeam();
    }

    function renderAdminAchievements() {
        const list = $('#adminAchievementsList');
        list.empty();
        storedAchievements.forEach((ach, i) => {
            const li = $('<li></li>', { class: 'list-group-item d-flex justify-content-between align-items-center' }).text(ach.title + ' ');
            const btnGroup = $('<div class="btn-group"></div>');
            const editBtn = $('<button class="btn btn-warning btn-sm me-2">Edit</button>');
            editBtn.on('click', function() { startEdit('achievements', i); });
            const delBtn = $('<button class="btn btn-danger btn-sm">Delete</button>');
            delBtn.on('click', function() { deleteAchievement(i); });
            btnGroup.append(editBtn).append(delBtn);
            li.append(btnGroup);
            list.append(li);
        });
    }

    function deleteAchievement(i) {
        if (!confirm("Delete this achievement?")) return;
        storedAchievements.splice(i, 1);
        sync();
        renderAdminAchievements();
    }

    // Helper: File to Base64
    function fileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => resolve(reader.result);
            reader.onerror = error => reject(error);
        });
    }

    fetchAll();
});
