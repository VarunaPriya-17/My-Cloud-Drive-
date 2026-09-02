import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { 
    getAuth, 
    signInWithEmailAndPassword, 
    createUserWithEmailAndPassword, 
    onAuthStateChanged, 
    signOut 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { 
    getFirestore, 
    collection, 
    addDoc, 
    query, 
    where, 
    onSnapshot, 
    orderBy,
    doc,
    updateDoc,
    deleteDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// --- CONFIGURATION ---
const firebaseConfig = {
    apiKey: "AIzaSyBJpFZs9sJ9wEZIczWKXUzLZhgJkcwniEA",
    authDomain: "my-cloud-drive-a4720.firebaseapp.com",
    projectId: "my-cloud-drive-a4720",
    storageBucket: "my-cloud-drive-a4720.firebasestorage.app",
    messagingSenderId: "555774759189",
    appId: "1:555774759189:web:b05fc2b95f2d569185191c",
    measurementId: "G-J6P0ZB25ML"
};

const CLOUDINARY_CLOUD_NAME = "dcu3qdqpt";
const CLOUDINARY_UPLOAD_PRESET = "clouddrive_preset";

// --- INITIALIZATION ---
let app, auth, db;
try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
} catch (error) {
    console.error("Firebase Initialization Error:", error);
}

// --- UI ELEMENTS ---
const authScreen = document.getElementById('auth-screen');
const dashboardContainer = document.getElementById('dashboard-container');
const authForm = document.getElementById('auth-form');
const authEmail = document.getElementById('auth-email');
const authPassword = document.getElementById('auth-password');
const authBtnText = document.getElementById('auth-btn-text');
const authToggleText = document.getElementById('auth-toggle-text');
const toggleAuthMode = document.getElementById('toggle-auth-mode');


const btnLogout = document.getElementById('btn-logout');
const modalContainer = document.getElementById('modal-container');
const fileGrid = document.getElementById('file-grid');
const emptyState = document.getElementById('empty-state');
const userNameDisplay = document.getElementById('user-name');
const storageIndicator = document.getElementById('progress-indicator');
const storageStatus = document.getElementById('storage-status');
const viewTitle = document.getElementById('view-title');
const breadcrumbContainer = document.getElementById('breadcrumb-container');
const btnNewFolder = document.getElementById('btn-new-folder');
const folderModal = document.getElementById('folder-modal');
const folderForm = document.getElementById('folder-form');
const folderInput = document.getElementById('folder-input');
const sidebarOverlay = document.getElementById('sidebar-overlay');
const sidebar = document.getElementById('sidebar');

let isLoginMode = true;
let currentUser = null;
let currentView = 'all'; 
let allFiles = [];
let currentlyActiveFile = null; 
let hasShown15Alert = false;
let hasShown20Alert = false;
let currentFolderId = null; 
let folderPath = []; 

// --- UTILS ---
const showToast = (message, type = 'success') => {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type === 'error' ? 'error' : ''}`;
    toast.innerHTML = `<i class="fas ${type === 'error' ? 'fa-exclamation-circle' : 'fa-check-circle'}"></i> <span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
        toast.classList.add('fade-out');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
};

const lockBodyScroll = () => {
    document.body.classList.add('no-scroll');
    const mainContent = document.getElementById('main-content');
    if (mainContent) mainContent.style.overflow = 'hidden';
};

const unlockBodyScroll = () => {
    document.body.classList.remove('no-scroll');
    const mainContent = document.getElementById('main-content');
    if (mainContent) mainContent.style.overflow = 'auto';
};

// --- AUTH LOGIC ---
const updateAuthUI = (user) => {
    if (user) {
        currentUser = user;
        authScreen.classList.add('hidden');
        dashboardContainer.classList.remove('hidden');
        userNameDisplay.textContent = user.email.split('@')[0];
        const savedView = localStorage.getItem('savedView') || 'all';
        const savedLayout = localStorage.getItem('savedLayout') || 'grid';
        
        switchView(savedView);
        if (savedLayout === 'list') {
            fileGrid.classList.add('list-view');
            document.getElementById('btn-list-view').classList.add('active');
            document.getElementById('btn-grid-view').classList.remove('active');
        }
        loadUserFiles(user.uid);
    } else {
        currentUser = null;
        authScreen.classList.remove('hidden');
        dashboardContainer.classList.add('hidden');
        allFiles = [];
        renderFiles([]);
    }
};

if (auth) {
    onAuthStateChanged(auth, updateAuthUI);
}

toggleAuthMode.addEventListener('click', (e) => {
    e.preventDefault();
    isLoginMode = !isLoginMode;
    authBtnText.textContent = isLoginMode ? "Sign In" : "Create Account";
    authToggleText.innerHTML = isLoginMode ? 
        `New here? <a href="#" id="toggle-auth-mode">Create an Account</a>` : 
        `Already have an account? <a href="#" id="toggle-auth-mode">Sign In</a>`;
    // Re-attach listener as innerHTML wipes it
    document.getElementById('toggle-auth-mode').onclick = (evt) => {
        evt.preventDefault();
        toggleAuthMode.click();
    };
});

authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = authEmail.value;
    const password = authPassword.value;

    try {
        if (isLoginMode) {
            await signInWithEmailAndPassword(auth, email, password);
            showToast("Welcome back!");
        } else {
            await createUserWithEmailAndPassword(auth, email, password);
            showToast("Account created successfully!");
        }
    } catch (error) {
        const friendlyMsg = getFriendlyAuthError(error.code);
        showToast(friendlyMsg, 'error');
    }
});

const getFriendlyAuthError = (code) => {
    switch (code) {
        case 'auth/email-already-in-use': return "This email is already registered. Please sign in instead.";
        case 'auth/invalid-email': return "The email format is incorrect. Please check it.";
        case 'auth/user-not-found': return "No account found with this email.";
        case 'auth/wrong-password': return "Incorrect password. Please try again.";
        case 'auth/weak-password': return "Password is too weak. Use at least 6 characters.";
        case 'auth/invalid-credential': return "Invalid email or password. Please try again.";
        default: return "Authentication failed. Please try again later.";
    }
};

// Password Toggle logic
const btnTogglePassword = document.getElementById('btn-toggle-password');
if (btnTogglePassword) {
    btnTogglePassword.addEventListener('click', () => {
        const type = authPassword.getAttribute('type') === 'password' ? 'text' : 'password';
        authPassword.setAttribute('type', type);
        btnTogglePassword.classList.toggle('fa-eye');
        btnTogglePassword.classList.toggle('fa-eye-slash');
    });
}

btnLogout.addEventListener('click', () => {
    hasShown15Alert = false;
    hasShown20Alert = false;
    signOut(auth);
});

// --- VIEW TOGGLES ---
document.getElementById('btn-grid-view').onclick = () => {
    fileGrid.classList.remove('list-view');
    document.getElementById('btn-grid-view').classList.add('active');
    document.getElementById('btn-list-view').classList.remove('active');
    localStorage.setItem('savedLayout', 'grid');
};
document.getElementById('btn-list-view').onclick = () => {
    fileGrid.classList.add('list-view');
    document.getElementById('btn-list-view').classList.add('active');
    document.getElementById('btn-grid-view').classList.remove('active');
    localStorage.setItem('savedLayout', 'list');
};

// --- SIDEBAR NAVIGATION ---
const switchView = (view) => {
    currentView = view;
    document.querySelectorAll('.nav-item').forEach(btn => btn.classList.remove('active'));
    
    let btnId = 'btn-my-drive';
    if (view === 'recent') btnId = 'btn-recent';
    if (view === 'starred') btnId = 'btn-starred';
    if (view === 'folders') btnId = 'btn-folders';
    if (view === 'trash') btnId = 'btn-trash';
    
    document.getElementById(btnId).classList.add('active');
    
    // Reset search
    fileSearch.value = "";
    
    // Update title
    if (view === 'all') viewTitle.textContent = 'My Drive';
    else if (view === 'folders') viewTitle.textContent = 'All Folders';
    else viewTitle.textContent = view.charAt(0).toUpperCase() + view.slice(1);
    
    // Always reset folder context when switching views from the sidebar to ensure root discovery
    // This allows clicking "My Drive" to return and show "all files and folder" as requested.
    if (view !== 'search') {
        currentFolderId = null;
        folderPath = [];
    }

    localStorage.setItem('savedView', view); // PERSIST VIEW
    renderFiles(allFiles);

    // AUTO-CLOSE SIDEBAR ON MOBILE AFTER CLICK
    const sidebarElement = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    if (window.innerWidth <= 768) {
        sidebarElement?.classList.remove('active');
        overlay?.classList.add('hidden');
        unlockBodyScroll();
    }
};

document.getElementById('btn-my-drive').onclick = () => switchView('all');
document.getElementById('btn-recent').onclick = () => switchView('recent');
document.getElementById('btn-starred').onclick = () => switchView('starred');
document.getElementById('btn-folders').onclick = () => switchView('folders');
document.getElementById('btn-trash').onclick = () => switchView('trash');

// --- SEARCH LOGIC ---
const fileSearch = document.getElementById('file-search');
if (fileSearch) {
    fileSearch.addEventListener('input', () => {
        renderFiles(allFiles);
    });
}

// --- CLOUDINARY UPLOAD ---
console.log("Cloudinary Widget Init - v3 (No Format Restrictions)");
const myWidget = cloudinary.createUploadWidget({
    cloudName: CLOUDINARY_CLOUD_NAME, 
    uploadPreset: CLOUDINARY_UPLOAD_PRESET,
    folder: 'clouddrive', 
    resourceType: 'auto',
    maxFileSize: 1000000000 // 1GB limit
}, (error, result) => { 
    if (!error && result && result.event === "success") { 
        if (result.info.bytes > 1000000000) {
            showModal(document.getElementById('alert-1gb-file'));
            return;
        }
        saveFileMetadata(result.info);
        showToast("File uploaded successfully");
    }
});



const saveFileMetadata = async (fileInfo) => {
    try {
        // ULTIMATE FORMAT PROTECTION: Extract from URL to avoid .bin bug
        const urlParts = fileInfo.secure_url.split('.');
        const detectedExt = urlParts.pop().toLowerCase();
        const baseName = fileInfo.original_filename;
        const fileName = `${baseName}.${detectedExt}`;
        
        await addDoc(collection(db, "files"), {
            userId: currentUser.uid,
            name: fileName,
            url: fileInfo.secure_url,
            type: fileInfo.resource_type,
            format: detectedExt,
            size: fileInfo.bytes,
            createdAt: Date.now(),
            isStarred: false,
            status: 'active',
            parentId: currentFolderId || null
        });
    } catch (error) {
        console.error("Error saving file info:", error);
    }
};

// --- FIRESTORE REAL-TIME UPDATES ---
// --- FIRESTORE REAL-TIME UPDATES ---
const loadUserFiles = (uid) => {
    const q = query(collection(db, "files"), where("userId", "==", uid));
    onSnapshot(q, (snapshot) => {
        allFiles = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        allFiles.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        updateStorageUsage(); 
        renderFiles(allFiles);
    }, (err) => {
        console.error("Firestore Error:", err);
        if (err.code === 'permission-denied') {
            // showToast("Permission denied. Try refreshing.", "error");
        }
    });
};

const updateStorageUsage = () => {
    const totalSize = allFiles.reduce((acc, f) => acc + (f.size || 0), 0);
    const limit = 25 * 1024 * 1024 * 1024;
    const usagePercent = (totalSize / limit) * 100;
    
    storageIndicator.style.width = usagePercent + '%';
    storageStatus.textContent = `${(totalSize / 1024 / 1024).toFixed(1)} MB / 25 GB`;

    // Threshold Alerts (Persistent logic)
    if (totalSize > 21474836480 && !hasShown20Alert) { // ~20GB
        showModal(document.getElementById('alert-20gb'));
        hasShown20Alert = true;
    } else if (totalSize > 16106127360 && !hasShown15Alert) { // ~15GB
        showModal(document.getElementById('alert-15gb'));
        hasShown15Alert = true;
    }
};

// --- UI RENDERING ---
const renderBreadcrumbs = () => {
    const breadcrumbContainer = document.getElementById('breadcrumb-container');
    if (!breadcrumbContainer) return;

    if (!currentFolderId) {
        breadcrumbContainer.style.display = 'none';
        breadcrumbContainer.innerHTML = '';
        return;
    }
    
    breadcrumbContainer.style.display = 'flex';
    breadcrumbContainer.innerHTML = '';
    
    // Root link
    const rootLink = document.createElement('span');
    rootLink.className = 'breadcrumb-item';
    rootLink.textContent = 'Drive'; 
    rootLink.onclick = () => navigateToPath(-1);
    breadcrumbContainer.appendChild(rootLink);
    
    folderPath.forEach((folder, index) => {
        const separator = document.createElement('span');
        separator.className = 'breadcrumb-separator';
        separator.innerHTML = '<i class="fas fa-chevron-right"></i>';
        breadcrumbContainer.appendChild(separator);
        
        const link = document.createElement('span');
        link.className = `breadcrumb-item ${index === folderPath.length - 1 ? 'active' : ''}`;
        link.textContent = folder.name;
        link.onclick = () => navigateToPath(index);
        breadcrumbContainer.appendChild(link);
    });
};

const renderFiles = (files) => {
    const fileGrid = document.getElementById('file-grid');
    const emptyState = document.getElementById('empty-state');
    const titleEl = document.getElementById('view-title');
    const searchTerm = fileSearch ? fileSearch.value.trim().toLowerCase() : "";
    if (!fileGrid || !emptyState || !titleEl) return;

    fileGrid.innerHTML = '';
    
    let filtered = [];

    // GLOBAL SEARCH OVERRIDE
    if (searchTerm) {
        titleEl.textContent = `Search results for "${searchTerm}"`;
        filtered = files.filter(f => f.status !== 'trash' && f.name.toLowerCase().includes(searchTerm));
    } else {
        // NORMAL VIEW LOGIC
        if (currentView === 'all') {
            if (currentFolderId) {
                const currentFolder = allFiles.find(f => f.id === currentFolderId);
                titleEl.textContent = currentFolder ? currentFolder.name : "My Drive";
            } else {
                titleEl.textContent = "My Drive";
            }
            filtered = files.filter(f => f.status !== 'trash' && (f.parentId || null) === (currentFolderId || null));
        } else if (currentView === 'folders') {
            if (currentFolderId) {
                const currentFolder = allFiles.find(f => f.id === currentFolderId);
                titleEl.textContent = currentFolder ? currentFolder.name : "All Folders";
                filtered = files.filter(f => f.status !== 'trash' && (f.parentId || null) === (currentFolderId || null));
            } else {
                titleEl.textContent = "All Folders";
                filtered = files.filter(f => f.status !== 'trash' && f.type === 'folder' && !f.parentId);
            }
        } else if (currentView === 'recent') {
            titleEl.textContent = "Recent Files";
            filtered = files.filter(f => f.status !== 'trash' && f.type !== 'folder').slice(0, 15);
        } else if (currentView === 'starred') {
            titleEl.textContent = "Starred Files";
            filtered = files.filter(f => f.status !== 'trash' && f.isStarred);
        } else if (currentView === 'trash') {
            titleEl.textContent = "Trash Bin";
            filtered = files.filter(f => f.status === 'trash');
        }
    }

    renderBreadcrumbs();

    const fragment = document.createDocumentFragment();

    if (filtered.length === 0) {
        emptyState.classList.remove('hidden');
        fileGrid.classList.add('hidden');
    } else {
        emptyState.classList.add('hidden');
        fileGrid.classList.remove('hidden');
        
        filtered.forEach(file => {
            const card = document.createElement('div');
            const isFolder = file.type === 'folder';
            card.className = `file-card ${file.isStarred ? 'starred' : ''} ${isFolder ? 'folder' : ''}`;
            
            let previewHTML = '';
            if (isFolder) {
                previewHTML = `<i class="fas fa-folder"></i>`;
            } else {
                const fmt = (file.format || '').toLowerCase();
                const isImage = (file.type === 'image' || ['jpg', 'jpeg', 'png', 'webp'].includes(fmt)) && fmt !== 'pdf';
                const isPDF = fmt === 'pdf';
                
                if (isImage) {
                    // PERFORMANCE: Use auto formats and quality
                    const optimizedUrl = file.url.replace('/upload/', '/upload/w_300,h_200,c_thumb,g_auto,f_auto,q_auto/');
                    previewHTML = `<img src="${optimizedUrl}" loading="lazy" style="width:100%; height:100%; object-fit:cover; border-radius:8px;">`;
                } else if (isPDF) {
                    // PERFORMANCE: Optimized PDF thumb
                    const pdfThumb = file.url.replace('.pdf', '.png').replace('/upload/', '/upload/w_200,h_260,c_fill,pg_1,q_auto,f_auto/').replace('.png', '.webp');
                    previewHTML = `<img src="${pdfThumb}" loading="lazy" style="width:100%; height:100%; object-fit:cover; border-radius:8px;">`;
                } else {
                    let icon = 'fa-file';
                    if (file.type === 'video') icon = 'fa-file-video';
                    else if (file.type === 'audio' || fmt === 'mp3') icon = 'fa-file-audio';
                    else if (['doc', 'docx'].includes(fmt)) icon = 'fa-file-word';
                    else if (['xls', 'xlsx'].includes(fmt)) icon = 'fa-file-excel';
                    else if (['csv'].includes(fmt)) icon = 'fa-file-csv';
                    else if (['zip', 'rar'].includes(fmt)) icon = 'fa-file-archive';
                    else if (fmt === 'pdf') icon = 'fa-file-pdf';
                    else if (fmt === 'apk') icon = 'fa-android';
                    previewHTML = `<i class="fas ${icon}"></i>`;
                }
            }

            const fileSize = isFolder ? '-- MB' : `${(file.size / 1024 / 1024).toFixed(2)} MB`;

            card.innerHTML = `
                <div class="star-badge"><i class="fas fa-star"></i></div>
                <button class="file-actions-btn"><i class="fas fa-ellipsis-v"></i></button>
                <div class="file-icon">${previewHTML}</div>
                <div class="file-info">
                    <p class="file-name">${file.name}</p>
                    <p class="file-meta">${fileSize} • ${new Date(file.createdAt).toLocaleDateString()}</p>
                </div>
            `;

            card.querySelector('.file-actions-btn').onclick = (e) => {
                e.stopPropagation();
                file.status === 'trash' ? showTrashMenu(e, file) : showActionMenu(e, file);
            };

            card.onclick = () => {
                if (isFolder) openFolder(file);
                else cardOpen(file);
            };

            fragment.appendChild(card);
        });
        fileGrid.appendChild(fragment);
    }
};

const createNewFolder = async (name) => {
    if (!currentUser) return;
    try {
        const payload = {
            userId: currentUser.uid,
            name: name,
            type: 'folder',
            createdAt: Date.now(),
            isStarred: false,
            status: 'active',
            parentId: currentFolderId || null
        };
        console.log("Sending payload to Firestore:", payload);
        const docRef = await addDoc(collection(db, "files"), payload);
        console.log("Folder created with ID:", docRef.id);
        showToast("Folder created successfully");
        hideModals();
        
        // Match existing rename pattern for reliable sync
        setTimeout(() => {
            window.location.reload();
        }, 500);
    } catch (err) {
        console.error("Critical Folder creation error:", err);
        showToast("Error creating folder: " + err.message, "error");
    }
};

const openFolder = (folder) => {
    // If not in a standard "tree" view, but user wants to open, we stay in current view but update context
    // The user specifically wants folders to "open" like My Drive but within the Folder Menu context.
    
    // Update folder context
    currentFolderId = folder.id;
    // Only push if not already at the end of the path to avoid repeats
    if (!folderPath.some(f => f.id === folder.id)) {
        folderPath.push({ id: folder.id, name: folder.name });
    }
    renderFiles(allFiles);
};

const navigateToPath = (index) => {
    if (index === -1) {
        currentFolderId = null;
        folderPath = [];
    } else {
        const target = folderPath[index];
        currentFolderId = target.id;
        folderPath = folderPath.slice(0, index + 1);
    }
    renderFiles(allFiles);
};
// --- MENUS ---
const showActionMenu = (e, file) => {
    e.preventDefault();
    e.stopPropagation();
    const existing = document.querySelector('.action-dropdown');
    if (existing) existing.remove();

    const menu = document.createElement('div');
    const isMobile = window.innerWidth <= 768;
    menu.className = `action-dropdown fade-in ${isMobile ? 'mobile-sheet' : ''}`;
    
    if (!isMobile) {
        menu.style.left = Math.min(e.clientX, window.innerWidth - 220) + 'px';
        menu.style.top = Math.min(e.clientY, window.innerHeight - 250) + 'px';
    }

    menu.innerHTML = `
        <div class="dropdown-item" id="menu-open"><i class="fas fa-external-link-alt"></i> <span>Open</span></div>
        <div class="dropdown-item" id="menu-download"><i class="fas fa-download"></i> <span>Download</span></div>
        <div class="dropdown-item" id="menu-rename"><i class="fas fa-edit"></i> <span>Rename</span></div>
        <div class="dropdown-item" id="menu-star"><i class="fas fa-star"></i> <span>${file.isStarred ? 'Unstar' : 'Star'}</span></div>
        <div class="dropdown-item" id="menu-share"><i class="fas fa-share-alt"></i> <span>Share</span></div>
        <div class="dropdown-item delete" id="menu-trash"><i class="fas fa-trash-alt"></i> <span>Move to Trash</span></div>
    `;

    document.body.appendChild(menu);
    if (isMobile) lockBodyScroll();

    menu.querySelector('#menu-open').onclick = () => cardOpen(file);
    menu.querySelector('#menu-download').onclick = () => cardDownload(file);
    menu.querySelector('#menu-rename').onclick = () => showRenameModal(file);
    menu.querySelector('#menu-star').onclick = () => toggleStar(file);
    menu.querySelector('#menu-share').onclick = () => showShareModal(file);
    menu.querySelector('#menu-trash').onclick = () => moveFileToTrash(file);

    setTimeout(() => document.onclick = () => {
        menu.remove();
        if (isMobile) unlockBodyScroll();
    }, 10);
};

const showTrashMenu = (e, file) => {
    e.preventDefault();
    e.stopPropagation();
    const existing = document.querySelector('.action-dropdown');
    if (existing) existing.remove();

    const menu = document.createElement('div');
    const isMobile = window.innerWidth <= 768;
    menu.className = `action-dropdown fade-in ${isMobile ? 'mobile-sheet' : ''}`;
    
    if (!isMobile) {
        menu.style.left = Math.min(e.clientX, window.innerWidth - 220) + 'px';
        menu.style.top = Math.min(e.clientY, window.innerHeight - 150) + 'px';
    }

    menu.innerHTML = `
        <div class="dropdown-item" id="menu-restore"><i class="fas fa-undo"></i> <span>Restore</span></div>
        <div class="dropdown-item delete" id="menu-delete-forever"><i class="fas fa-exclamation-triangle"></i> <span>Delete Forever</span></div>
    `;

    document.body.appendChild(menu);

    menu.querySelector('#menu-restore').onclick = () => restoreFromTrash(file);
    menu.querySelector('#menu-delete-forever').onclick = () => showDeleteForeverModal(file);

    setTimeout(() => document.onclick = () => {
        menu.remove();
        if (isMobile) unlockBodyScroll();
    }, 10);
};

// --- FILE ACTIONS ---
const cardOpen = async (file) => {
    const ext = file.name.split('.').pop().toLowerCase();
    // REMOVED CSV FROM DOCS READER AS IT SOMETIMES CORRUPTS THE VIEW
    const isDoc = ['xlsx', 'xls', 'docx', 'doc', 'zip', 'rar'].includes(ext);
    
    if (isDoc) {
        showToast("Opening in Reader View...", "info");
        const readerUrl = `https://docs.google.com/viewer?url=${encodeURIComponent(file.url)}&embedded=false`;
        window.open(readerUrl, '_blank');
        return;
    }

    // NORMAL PREVIEW (Images, PDF, MP3, CSV)
    // For Open, we want to ensure the file is NOT forced as a download
    let openUrl = file.url;
    if (openUrl.includes('cloudinary.com')) {
        openUrl = openUrl.replace('/fl_attachment/', '/'); // Ensure no attachment flag
    }
    window.open(openUrl, '_blank');
};

const cardDownload = async (file) => {
    showToast(`Downloading: ${file.name}`, "info");

    try {
        // USE CLOUDINARY NATIVE ATTACHMENT WITH FILENAME
        // This is the most robust way to force the filename without CORS fetch issues
        let dlUrl = file.url;
        if (dlUrl.includes('cloudinary.com')) {
            // Remove existing transformations to avoid conflicts
            const baseUrl = dlUrl.split('/upload/')[0];
            const remains = dlUrl.split('/upload/')[1];
            // filename should be without expansion for fl_attachment
            const nameOnly = file.name.split('.')[0];
            dlUrl = `${baseUrl}/upload/fl_attachment:${nameOnly}/${remains}`;
        }

        const a = document.createElement('a');
        a.href = dlUrl;
        a.download = file.name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        
        showToast(`Download started: ${file.name}`);
    } catch (err) {
        console.error("Download failure:", err);
        window.open(file.url, '_blank');
    }
};

const toggleStar = async (file) => {
    await updateDoc(doc(db, "files", file.id), { isStarred: !file.isStarred });
    showToast(file.isStarred ? "Removed from Starred" : "Added to Starred");
};

const moveFileToTrash = (file) => {
    currentlyActiveFile = file;
    showModal(document.getElementById('trash-modal'));
};

const restoreFromTrash = async (file) => {
    await updateDoc(doc(db, "files", file.id), { status: 'active' });
    showToast("File restored");
};

// --- MODALS ---
const showModal = (modal) => {
    modalContainer.classList.remove('hidden');
    modal.classList.remove('hidden');
    lockBodyScroll();
};

const hideModals = () => {
    modalContainer.classList.add('hidden');
    document.querySelectorAll('.modal-content').forEach(m => m.classList.add('hidden'));
    const sidebarElement = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    if (window.innerWidth <= 768) {
        sidebarElement?.classList.remove('active');
        overlay?.classList.add('hidden');
    }
    unlockBodyScroll();
};

document.querySelectorAll('.btn-close-modal').forEach(btn => btn.onclick = hideModals);
modalContainer.onclick = (e) => e.target === modalContainer && hideModals();

const showRenameModal = (file) => {
    currentlyActiveFile = file;
    const input = document.getElementById('rename-input');
    input.value = file.name; // FULL POWER: SHOW FULL FILENAME + EXTENSION
    showModal(document.getElementById('rename-modal'));
    input.focus();
    input.select();
};

const showShareModal = (file) => {
    currentlyActiveFile = file;
    const modal = document.getElementById('share-modal');
    showModal(modal);
};

document.getElementById('btn-share-file').onclick = async () => {
    if (!currentlyActiveFile) return;
    showToast("Preparing file for sharing...", "info");
    try {
        // Try to fetch with anonymous credentials to avoid CORS blockage for simpler files
        const response = await fetch(currentlyActiveFile.url, { mode: 'cors' });
        const blob = await response.blob();
        const shareFile = new File([blob], currentlyActiveFile.name, { type: blob.type || 'application/octet-stream' });
        
        // CAN SHARE CHECK
        if (navigator.share && navigator.canShare && navigator.canShare({ files: [shareFile] })) {
            await navigator.share({
                files: [shareFile],
                title: currentlyActiveFile.name
            });
        } else {
            // Fallback for sharing
            const shareUrl = currentlyActiveFile.url;
            if (navigator.share) {
                await navigator.share({
                    title: currentlyActiveFile.name,
                    url: shareUrl
                });
            } else {
                alert("Redirecting to file link as direct sharing is not supported on this device.");
                window.open(shareUrl, '_blank');
            }
        }
    } catch (err) {
        console.error("Share failed:", err);
        showToast("Failed to share file. Try link instead.", "error");
    }
};

document.getElementById('btn-share-link').onclick = async () => {
    if (!currentlyActiveFile) return;
    if (navigator.share) {
        await navigator.share({
            title: currentlyActiveFile.name,
            url: currentlyActiveFile.url
        });
    } else {
        showToast("Link sharing not supported", "error");
    }
};

document.getElementById('btn-copy-link').onclick = () => {
    if (!currentlyActiveFile) return;
    navigator.clipboard.writeText(currentlyActiveFile.url);
    showToast("Link copied to clipboard");
};

const showDeleteForeverModal = (file) => {
    currentlyActiveFile = file;
    showModal(document.getElementById('delete-forever-modal'));
};

// --- FINAL INITIALIZATION & EVENT BINDING ---

// --- MODAL SYSTEM INIT (Stable) ---
const initModalSystem = () => {
    // Folder creation logic removed from here (now moved to top-level handler below)

    // Confirm Move to Trash
    const btnTrashConfirm = document.getElementById('btn-confirm-trash');
    if (btnTrashConfirm) {
        btnTrashConfirm.onclick = async () => {
            if (!currentlyActiveFile) return;
            try {
                await updateDoc(doc(db, "files", currentlyActiveFile.id), { status: 'trash' });
                showToast("Moved to Trash");
                hideModals();
            } catch (err) { console.error(err); }
        };
    }

    // Confirm Delete Forever
    const btnDelConfirm = document.getElementById('btn-confirm-delete');
    if (btnDelConfirm) {
        btnDelConfirm.onclick = async () => {
            if (!currentlyActiveFile) return;
            try {
                await deleteDoc(doc(db, "files", currentlyActiveFile.id));
                showToast("Permanently deleted");
                hideModals();
            } catch (err) { console.error(err); }
        };
    }
    
    // Cancel listeners
    document.querySelectorAll('.btn-close-modal').forEach(btn => btn.onclick = hideModals);
    const btnCancelTrash = document.getElementById('btn-cancel-trash');
    if (btnCancelTrash) btnCancelTrash.onclick = hideModals;
    const btnCancelDelete = document.getElementById('btn-cancel-delete');
    if (btnCancelDelete) btnCancelDelete.onclick = hideModals;
};

// --- RENAME HANDLER (DIRECT & ROBUST) ---
const handleRenameAction = async () => {
    console.log("Direct Rename Triggered");
    if (!currentlyActiveFile) {
        console.error("Rename Failed: No currentlyActiveFile");
        hideModals();
        return;
    }
    const input = document.getElementById('rename-input');
    const newName = input ? input.value.trim() : "";
    if (!newName) return;

    try {
        console.log(`Renaming ${currentlyActiveFile.id} to ${newName}`);
        hideModals();
        showToast("Renaming...");
        const fileRef = doc(db, "files", currentlyActiveFile.id);
        await updateDoc(fileRef, { name: newName });
        showToast("Renamed successfully!", "success");
        setTimeout(() => window.location.reload(), 500);
    } catch (err) {
        console.error("Rename Error:", err);
        showToast("Rename failed: " + err.message, "error");
    }
};

// --- ROBUST FOLDER CREATION ---
const handleFolderCreation = async (e) => {
    if (e) e.preventDefault();
    const input = document.getElementById('folder-input');
    const name = input ? input.value.trim() : "";
    if (!name) return;

    if (!currentUser) {
        showToast("Please login first", "error");
        return;
    }

    const btn = document.getElementById('btn-create-folder-confirm');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating...';
    }

    try {
        console.log(`Creating folder: ${name} in parent: ${currentFolderId}`);
        
        const folderData = {
            userId: currentUser.uid,
            name: name,
            type: 'folder',
            createdAt: Date.now(),
            isStarred: false,
            status: 'active',
            parentId: currentFolderId || null
        };

        await addDoc(collection(db, "files"), folderData);
        showToast("Folder created successfully!");
        
        hideModals();
        setTimeout(() => window.location.reload(), 500);
    } catch (err) {
        console.error("Folder Creation Error:", err);
        showToast("Failed to create folder: " + err.message, "error");
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = 'Create Folder';
        }
    }
};

// Global click delegation for triggers
document.addEventListener('click', (e) => {
    // Upload Trigger
    const uploadTrigger = e.target.closest('#btn-upload');
    if (uploadTrigger) {
        if (currentUser) {
            myWidget.open();
        } else {
            showToast("Please login to upload files", 'error');
        }
        return;
    }

    // New Folder Trigger
    const trigger = e.target.closest('#btn-new-folder');
    if (trigger) {
        if (currentUser) {
            const modal = document.getElementById('folder-modal');
            const input = document.getElementById('folder-input');
            if (input) input.value = "";
            showModal(modal);
            setTimeout(() => input?.focus(), 100);
            
            // Re-attach direct submit listener just in case
            const form = document.getElementById('folder-form');
            if (form) {
                form.onsubmit = (evt) => handleFolderCreation(evt);
            }
        } else {
            showToast("Please login to create folders", "error");
        }
        return;
    }

    // Sidebar Mobile Toggle
    const btnMobileMenu = e.target.closest('#btn-mobile-menu');
    const overlay = document.getElementById('sidebar-overlay');
    const sidebarElement = document.getElementById('sidebar');

    if (btnMobileMenu) {
        sidebarElement?.classList.add('active');
        overlay?.classList.remove('hidden');
        lockBodyScroll();
        return;
    }

    if (e.target.id === 'sidebar-overlay') {
        sidebarElement?.classList.remove('active');
        overlay?.classList.add('hidden');
        unlockBodyScroll();
        return;
    }

    // Rename Confirm
    if (e.target.id === 'btn-confirm-rename' || e.target.closest('#btn-confirm-rename')) {
        handleRenameAction();
        return;
    }

    // Folder Confirm
    if (e.target.id === 'btn-create-folder-confirm' || e.target.closest('#btn-create-folder-confirm')) {
        handleFolderCreation();
        return;
    }
});

// Global submit delegation (Handled by click now for reliability)
// Removed to prevent default form submission side effects

document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && document.getElementById('rename-modal') && !document.getElementById('rename-modal').classList.contains('hidden')) {
        handleRenameAction();
    }
});

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initModalSystem);
} else {
    initModalSystem();
}
