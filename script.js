import { initializeApp } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-app.js";
import { getAuth, onAuthStateChanged, sendPasswordResetEmail, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";
import { getDatabase, limitToLast, onValue, orderByChild, query, ref, remove, set } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-database.js";

const firebaseConfig = {
    apiKey: "AIzaSyBh1s2S6rZe9zK4DLWpZUcpXtXZolEBQlI",
    authDomain: "webapp-e8b28.firebaseapp.com",
    projectId: "webapp-e8b28",
    storageBucket: "webapp-e8b28.firebasestorage.app",
    messagingSenderId: "126884302653",
    appId: "1:126884302653:web:2e0ab14def6bad3361ff54",
    measurementId: "G-GJVK5R349Q"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);
const notesRef = ref(db, "notes/items");
const publicNotesQuery = query(notesRef, orderByChild("updatedAt"), limitToLast(150));

let publicNotes = [];
let adminNotes = [];
let currentUser = null;
let clientVisibleCount = 12;
const CLIENT_PAGE_SIZE = 12;
let clientFiltersInitialized = false;
let detachAdminNotes = null;
let publicNotesLoaded = false;
let adminNotesLoaded = false;

function escapeHTML(value) {
    return (value || "")
        .toString()
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function formatDate(timestamp) {
    if (!timestamp) return "Unknown";
    return new Date(timestamp).toLocaleString();
}

function createId() {
    return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function createSlug(title) {
    return (title || "")
        .toString()
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "") || "note";
}

function isPublic(note) {
    return (note.visibility || "public") === "public";
}

function getPublicNotes() {
    return publicNotes.filter(isPublic);
}

function renderSkeletonCards(count = 4) {
    return Array.from({ length: count }, () => `
        <article class="note-card note-card--skeleton" aria-hidden="true">
            <div class="note-meta">
                <span class="skeleton skeleton--pill"></span>
                <span class="skeleton skeleton--pill"></span>
                <span class="skeleton skeleton--pill"></span>
            </div>
            <div class="skeleton skeleton--line skeleton--title"></div>
            <div class="skeleton skeleton--line skeleton--meta"></div>
            <div class="skeleton skeleton--block"></div>
            <div class="skeleton skeleton--line"></div>
        </article>
    `).join("");
}

function normalizeNote(note) {
    const type = note.type || "";
    const normalized = { ...note };

    if (!normalized.contentType) {
        normalized.contentType = note.contentType || "note";
    }

    if (!normalized.faculty) {
        normalized.faculty = note.faculty || "others";
    }

    if (Array.isArray(normalized.images)) {
        normalized.images = normalized.images
            .map(image => {
                if (!image) return null;
                if (typeof image === "string") {
                    return { data: image, name: "" };
                }
                if (typeof image === "object") {
                    return {
                        data: image.data || image.url || image.src || "",
                        name: image.name || image.fileName || ""
                    };
                }
                return null;
            })
            .filter(image => image && image.data);
    } else if (normalized.imageData) {
        normalized.images = [
            typeof normalized.imageData === "string"
                ? { data: normalized.imageData, name: normalized.imageName || "" }
                : normalized.imageData
        ].filter(image => image && image.data);
    } else {
        normalized.images = [];
    }

    if (!normalized.semester) {
        normalized.semester = 1;
    }

    if (!normalized.images.length && type === "image" && normalized.fileData) {
        normalized.images = [{ data: normalized.fileData, name: normalized.fileName || "" }];
    }

    if (!normalized.pdfData && type === "pdf" && normalized.fileData) {
        normalized.pdfData = normalized.fileData;
        normalized.pdfName = normalized.fileName || "";
    }

    if (!normalized.textContent && type === "text" && note.textContent) {
        normalized.textContent = note.textContent;
    }

    return normalized;
}

function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error("Unable to read file."));
        reader.readAsDataURL(file);
    });
}

function getSemesterLabel(semester) {
    const value = Number(semester) || 1;
    const suffixMap = { 1: "st", 2: "nd", 3: "rd" };
    const suffix = suffixMap[value] || "th";
    return `${value}${suffix} Semester`;
}

function getNotePreview(note) {
    if (note.description && note.description.trim()) return note.description.trim();
    if (note.textContent) return note.textContent.slice(0, 140);
    if (note.images && note.images.length && note.pdfData) return `Contains ${note.images.length} image${note.images.length === 1 ? "" : "s"} and PDF`;
    if (note.images && note.images.length) return `Contains ${note.images.length} image${note.images.length === 1 ? "" : "s"}`;
    if (note.pdfData) return note.pdfName ? `PDF: ${note.pdfName}` : "Contains PDF";
    return "No preview available";
}

function getNoteKind(note) {
    const hasText = !!(note.textContent && note.textContent.trim());
    const hasImage = !!(note.images && note.images.length);
    const hasPdf = !!note.pdfData;

    if (hasText && hasImage && hasPdf) return "TEXT + IMAGE + PDF";
    if (hasText && hasImage) return "TEXT + IMAGE";
    if (hasText && hasPdf) return "TEXT + PDF";
    if (hasImage && hasPdf) return "IMAGE + PDF";
    if (hasText) return "TEXT";
    if (hasImage) return "IMAGE";
    if (hasPdf) return "PDF";
    return "EMPTY";
}

function getContentTypeLabel(note) {
    if (note.contentType === "question-paper") return "Question Paper";
    if (note.contentType === "syllabus") return "Syllabus";
    return "Note";
}

function getContentTypeClass(note) {
    if (note.contentType === "question-paper") return "content-type-pill content-type-pill--question-paper";
    if (note.contentType === "syllabus") return "content-type-pill content-type-pill--syllabus";
    return "content-type-pill";
}

function getFacultyLabel(faculty) {
    const value = (faculty || "").toLowerCase();
    if (value === "engineering") return "Engineering";
    if (value === "bca") return "BCA";
    if (value === "bit") return "BIT";
    return "Others";
}

function getCardVisual(note) {
    const visual = note.thumbnailData || (note.images && note.images[0] ? note.images[0].data : "") || "";
    if (!visual) return "";
    return `<img class="note-thumb" src="${visual}" loading="lazy" alt="${escapeHTML(note.title || "Note")}">`;
}

function syncClientFiltersFromURL() {
    const grid = document.getElementById("publicNotesGrid");
    if (!grid || clientFiltersInitialized) return;

    const url = new URL(window.location.href);
    const params = url.searchParams;

    const searchEl = document.getElementById("searchInput");
    const semesterEl = document.getElementById("semesterFilter");
    const contentTypeEl = document.getElementById("contentTypeFilter");
    const facultyEl = document.getElementById("facultyFilter");

    if (searchEl && params.get("search")) {
        searchEl.value = params.get("search") || "";
    }
    if (semesterEl && params.get("semester")) {
        semesterEl.value = params.get("semester") || "all";
    }
    if (contentTypeEl && params.get("contentType")) {
        contentTypeEl.value = params.get("contentType") || "all";
    }
    if (facultyEl && params.get("faculty")) {
        facultyEl.value = params.get("faculty") || "all";
    }

    clientFiltersInitialized = true;
}

function syncURLFromClientFilters() {
    const grid = document.getElementById("publicNotesGrid");
    if (!grid) return;

    const url = new URL(window.location.href);
    const searchEl = document.getElementById("searchInput");
    const semesterEl = document.getElementById("semesterFilter");
    const contentTypeEl = document.getElementById("contentTypeFilter");
    const facultyEl = document.getElementById("facultyFilter");

    const entries = [
        ["search", searchEl ? searchEl.value.trim() : ""],
        ["semester", semesterEl ? semesterEl.value : "all"],
        ["contentType", contentTypeEl ? contentTypeEl.value : "all"],
        ["faculty", facultyEl ? facultyEl.value : "all"]
    ];

    entries.forEach(([key, value]) => {
        if (!value || value === "all") {
            url.searchParams.delete(key);
        } else {
            url.searchParams.set(key, value);
        }
    });

    window.history.replaceState({}, "", url);
}

function buildNoteCard(note, options = {}) {
    const preview = escapeHTML(getNotePreview(note));
    const chipsParts = [];

    chipsParts.push(`<span class="${getContentTypeClass(note)}">${escapeHTML(getContentTypeLabel(note))}</span>`);

    const facultyVal = (note.faculty || "").toLowerCase();
    if (facultyVal && facultyVal !== "others") {
        chipsParts.push(`<span class="chip">${escapeHTML(getFacultyLabel(note.faculty))}</span>`);
    }

    chipsParts.push(`<span class="chip">${escapeHTML(getSemesterLabel(note.semester || 1))}</span>`);

    if (options.admin) {
        chipsParts.push(`<span class="chip">${escapeHTML(getNoteKind(note))}</span>`);
        chipsParts.push(`<span class="chip">${escapeHTML(note.visibility || "public")}</span>`);
    }

    const chips = `
        <div class="note-meta">
            ${chipsParts.join('\n')}
        </div>
    `;

    const adminActions = options.admin
        ? `
        <div class="actions">
            <button class="btn secondary" onclick="editNote('${note.id}')">Edit</button>
            <button class="btn danger" onclick="deleteNote('${note.id}')">Delete</button>
        </div>
    `
        : `<a class="btn" href="scanner.html?slug=${encodeURIComponent(note.slug || createSlug(note.title))}">Open Note</a>`;

    return `
        <article class="note-card">
            ${chips}
            <h3 class="note-title">${escapeHTML(note.title || "Untitled")}</h3>
            <p class="note-preview">By ${escapeHTML(note.author || "Unknown")} • ${escapeHTML(formatDate(note.updatedAt || note.createdAt))}</p>
            ${getCardVisual(note)}
            <p class="note-preview">${preview}</p>
            ${adminActions}
        </article>
    `;
}

function renderHome() {
    const latestNotes = document.getElementById("latestNotes");
    const totalNotesCount = document.getElementById("totalNotesCount");
    const textNotesCount = document.getElementById("textNotesCount");
    const fileNotesCount = document.getElementById("fileNotesCount");

    if (!latestNotes) return;

    if (!publicNotesLoaded) {
        latestNotes.innerHTML = renderSkeletonCards(4);
        return;
    }

    const publicNotes = getPublicNotes();
    const latest = publicNotes.slice(0, 4);

    if (totalNotesCount) totalNotesCount.textContent = String(publicNotes.length);
    if (textNotesCount) textNotesCount.textContent = String(publicNotes.filter(note => note.textContent && note.textContent.trim()).length);
    if (fileNotesCount) fileNotesCount.textContent = String(publicNotes.filter(note => (note.images && note.images.length) || note.pdfData).length);

    latestNotes.innerHTML = latest.length
        ? latest.map(note => buildNoteCard(note)).join("")
        : '<p class="notice">No public notes yet. Check back soon for fresh uploads.</p>';
}

function renderClient() {
    const grid = document.getElementById("publicNotesGrid");
    if (!grid) return;

    const searchEl = document.getElementById("searchInput");
    const semesterEl = document.getElementById("semesterFilter");
    const contentTypeEl = document.getElementById("contentTypeFilter");
    const facultyEl = document.getElementById("facultyFilter");
    const semesterSortEl = document.getElementById("semesterSort");
    const countEl = document.getElementById("clientResultCount");
    const loadMoreWrap = document.getElementById("clientLoadMoreWrap");
    const loadMoreBtn = document.getElementById("clientLoadMoreBtn");

    if (!publicNotesLoaded) {
        grid.innerHTML = renderSkeletonCards(8);
        if (countEl) countEl.textContent = "Loading notes...";
        if (loadMoreWrap) loadMoreWrap.classList.add("hidden");
        return;
    }

    const publicNotes = getPublicNotes();
    syncClientFiltersFromURL();

    const search = (searchEl ? searchEl.value : "").trim().toLowerCase();
    const semester = semesterEl ? semesterEl.value : "all";
    const contentType = contentTypeEl ? contentTypeEl.value : "all";
    const faculty = facultyEl ? facultyEl.value : "all";
    const semesterSort = semesterSortEl ? semesterSortEl.value : "none";

    const filtered = publicNotes.filter(note => {
        const searchable = (note.searchText || `${note.title || ""} ${note.subject || ""} ${note.author || ""} ${note.description || ""} ${note.contentType || ""} ${note.faculty || ""}`).toLowerCase();
        const inSearch = !search || searchable.includes(search);

        const inSemester = semester === "all" || String(note.semester || 1) === semester;
        const inContentType = contentType === "all" || (note.contentType || "note") === contentType;
        const inFaculty = faculty === "all" || (note.faculty || "others") === faculty;
        return inSearch && inSemester && inContentType && inFaculty;
    });

    filtered.sort((a, b) => {
        if (semesterSort !== "none") {
            const aSem = Number(a.semester || 1);
            const bSem = Number(b.semester || 1);
            if (aSem !== bSem) return semesterSort === "asc" ? aSem - bSem : bSem - aSem;
        }

        return (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0);
    });

    if (countEl) {
        countEl.textContent = `${filtered.length} result${filtered.length === 1 ? "" : "s"}`;
    }

    const visible = filtered.slice(0, clientVisibleCount);

    grid.innerHTML = visible.length
        ? visible.map(note => buildNoteCard(note)).join("")
        : '<p class="notice">No study material matched your filter. Try changing content type, semester, or search keywords.</p>';

    const canLoadMore = filtered.length > clientVisibleCount;
    if (loadMoreWrap) {
        loadMoreWrap.classList.toggle("hidden", filtered.length === 0);
    }
    if (loadMoreBtn) {
        loadMoreBtn.disabled = !canLoadMore;
        loadMoreBtn.textContent = canLoadMore
            ? `Load More (${filtered.length - clientVisibleCount} left)`
            : "All notes loaded";
    }
}

function showAdminMessage(message, isError = false) {
    const status = document.getElementById("adminStatus");
    if (!status) return;
    status.classList.remove("hidden");
    status.textContent = message;
    status.style.color = isError ? "#a32727" : "#1f6f46";
}

function hideAdminMessage() {
    const status = document.getElementById("adminStatus");
    if (status) {
        status.classList.add("hidden");
        status.textContent = "";
    }
}

function clearFileInputs() {
    const imageInput = document.getElementById("imageInput");
    const pdfInput = document.getElementById("pdfInput");
    const thumbInput = document.getElementById("thumbnailInput");

    if (imageInput) imageInput.value = "";
    if (pdfInput) pdfInput.value = "";
    if (thumbInput) thumbInput.value = "";
}

function resetAdminFormState() {
    const form = document.getElementById("noteForm");
    const noteId = document.getElementById("noteId");
    const heading = document.getElementById("formHeading");

    if (form) form.reset();
    if (noteId) noteId.value = "";
    if (heading) heading.textContent = "Create Note";
    clearFileInputs();
    hideAdminMessage();
}

function resetClientPagination() {
    clientVisibleCount = CLIENT_PAGE_SIZE;
}

function renderAdminNotes() {
    const list = document.getElementById("adminNotesList");
    if (!list) return;

    if (!currentUser) {
        list.innerHTML = '<p class="notice">Log in to manage notes.</p>';
        return;
    }

    if (!adminNotesLoaded) {
        list.innerHTML = renderSkeletonCards(4);
        return;
    }

    list.innerHTML = adminNotes.length
        ? adminNotes.map(note => buildNoteCard(note, { admin: true })).join("")
        : '<p class="notice">No notes found. Create one using the form above.</p>';
}

function updateAdminUI() {
    const loginSection = document.getElementById("adminLoginSection");
    const appSection = document.getElementById("adminAppSection");
    const logoutBtn = document.getElementById("adminLogoutBtn");

    if (!loginSection || !appSection) return;

    const isLoggedIn = !!currentUser;
    loginSection.classList.toggle("hidden", isLoggedIn);
    appSection.classList.toggle("hidden", !isLoggedIn);
    if (logoutBtn) logoutBtn.classList.toggle("hidden", !isLoggedIn);
}

async function handleNoteSubmit(event) {
    event.preventDefault();
    hideAdminMessage();

    if (!currentUser) {
        showAdminMessage("Login required.", true);
        return;
    }

    const noteIdEl = document.getElementById("noteId");
    const titleEl = document.getElementById("title");
    const subjectEl = document.getElementById("subject");
    const authorEl = document.getElementById("author");
    const facultyEl = document.getElementById("faculty");
    const semesterEl = document.getElementById("semester");
    const visibilityEl = document.getElementById("visibility");
    const descriptionEl = document.getElementById("description");
    const textEl = document.getElementById("textContent");
    const imageEl = document.getElementById("imageInput");
    const pdfEl = document.getElementById("pdfInput");
    const thumbEl = document.getElementById("thumbnailInput");

    const id = noteIdEl && noteIdEl.value ? noteIdEl.value : createId();
    const existing = adminNotes.find(note => note.id === id);

    const title = titleEl ? titleEl.value.trim() : "";
    const subject = subjectEl ? subjectEl.value.trim() : "";
    const author = authorEl ? authorEl.value.trim() : "";
    const contentType = document.getElementById("contentType") ? document.getElementById("contentType").value : "note";
    const faculty = facultyEl ? facultyEl.value : "others";
    const semester = semesterEl ? Number(semesterEl.value || 1) : 1;
    const visibility = visibilityEl ? visibilityEl.value : "public";
    const description = descriptionEl ? descriptionEl.value.trim() : "";
    const textContent = textEl ? textEl.value.trim() : "";

    const imageFiles = imageEl && imageEl.files ? Array.from(imageEl.files) : [];
    const pdfFile = pdfEl && pdfEl.files ? pdfEl.files[0] : null;
    const thumbFile = thumbEl && thumbEl.files ? thumbEl.files[0] : null;

    if (!title || !subject || !author) {
        showAdminMessage("Title, subject, and author are required.", true);
        return;
    }

    let images = existing && Array.isArray(existing.images) ? [...existing.images] : [];
    let pdfData = existing ? existing.pdfData || "" : "";
    let pdfName = existing ? existing.pdfName || "" : "";
    let thumbnailData = existing ? existing.thumbnailData || "" : "";

    if (imageFiles.length) {
        const invalidImage = imageFiles.find(file => !file.type.startsWith("image/"));
        if (invalidImage) {
            showAdminMessage("Each image must be a valid image file.", true);
            return;
        }
        try {
            const imageEntries = await Promise.all(imageFiles.map(async file => ({
                data: await readFileAsDataURL(file),
                name: file.name
            })));
            images = existing && imageFiles.length ? imageEntries : imageEntries;
        } catch (error) {
            showAdminMessage(error.message || "Failed to read image files.", true);
            return;
        }
    }

    if (pdfFile) {
        if (pdfFile.type !== "application/pdf") {
            showAdminMessage("PDF must be a valid .pdf file.", true);
            return;
        }
        try {
            pdfData = await readFileAsDataURL(pdfFile);
            pdfName = pdfFile.name;
        } catch (error) {
            showAdminMessage(error.message || "Failed to read PDF file.", true);
            return;
        }
    }

    if (thumbFile) {
        if (!thumbFile.type.startsWith("image/")) {
            showAdminMessage("Thumbnail must be an image file.", true);
            return;
        }
        try {
            thumbnailData = await readFileAsDataURL(thumbFile);
        } catch (error) {
            showAdminMessage(error.message || "Failed to read thumbnail file.", true);
            return;
        }
    }

    if (!textContent && !images.length && !pdfData) {
        showAdminMessage("Add at least one content input: text, image, or PDF.", true);
        return;
    }

    const searchImageText = images.map(image => image.name || "").join(" ");

    const payload = {
        id,
        slug: createSlug(title),
        title,
        subject,
        semester,
        author,
        contentType,
        faculty,
        visibility,
        description,
        textContent,
        textExcerpt: textContent ? textContent.slice(0, 400) : "",
        searchText: `${title} ${subject} ${author} ${description} ${contentType} ${faculty} ${textContent.slice(0, 600)} ${searchImageText}`,
        images,
        imageData: images[0]?.data || "",
        imageName: images[0]?.name || "",
        pdfData,
        pdfName,
        thumbnailData,
        createdAt: existing ? existing.createdAt : Date.now(),
        updatedAt: Date.now(),
        createdBy: existing ? existing.createdBy : (currentUser.email || "admin")
    };

    try {
        await set(ref(db, `notes/items/${id}`), payload);
        showAdminMessage(existing ? "Note updated successfully." : "Note created successfully.");
        resetAdminFormState();
    } catch (error) {
        showAdminMessage(error.message || "Failed to save note.", true);
    }
}

window.filterClientNotes = function () {
    resetClientPagination();
    renderClient();
    syncURLFromClientFilters();
};

window.loadMoreClientNotes = function () {
    clientVisibleCount += CLIENT_PAGE_SIZE;
    renderClient();
};

window.adminLogin = async function () {
    const emailEl = document.getElementById("adminEmail");
    const passwordEl = document.getElementById("adminPassword");
    const errorEl = document.getElementById("adminError");

    if (!emailEl || !passwordEl || !errorEl) return;

    errorEl.classList.add("hidden");

    try {
        await signInWithEmailAndPassword(auth, emailEl.value.trim(), passwordEl.value);
    } catch (error) {
        errorEl.textContent = error.message || "Login failed.";
        errorEl.classList.remove("hidden");
    }
};

window.adminLogout = async function () {
    await signOut(auth);
};

window.resetAdminPassword = async function () {
    const emailEl = document.getElementById("adminEmail");
    const errorEl = document.getElementById("adminError");
    if (!emailEl || !errorEl) return;

    if (!emailEl.value.trim()) {
        errorEl.textContent = "Enter email first.";
        errorEl.classList.remove("hidden");
        return;
    }

    try {
        await sendPasswordResetEmail(auth, emailEl.value.trim());
        errorEl.textContent = "Password reset email sent.";
        errorEl.classList.remove("hidden");
    } catch (error) {
        errorEl.textContent = error.message || "Failed to send reset email.";
        errorEl.classList.remove("hidden");
    }
};

window.clearAdminForm = function () {
    resetAdminFormState();
};

window.editNote = function (noteId) {
    const note = adminNotes.find(item => item.id === noteId);
    if (!note) return;

    const noteIdEl = document.getElementById("noteId");
    const titleEl = document.getElementById("title");
    const subjectEl = document.getElementById("subject");
    const authorEl = document.getElementById("author");
    const facultyEl = document.getElementById("faculty");
    const contentTypeEl = document.getElementById("contentType");
    const semesterEl = document.getElementById("semester");
    const visibilityEl = document.getElementById("visibility");
    const descriptionEl = document.getElementById("description");
    const textEl = document.getElementById("textContent");
    const heading = document.getElementById("formHeading");

    if (!noteIdEl || !titleEl || !subjectEl || !authorEl || !facultyEl || !contentTypeEl || !semesterEl || !visibilityEl || !descriptionEl || !textEl) {
        return;
    }

    noteIdEl.value = note.id;
    titleEl.value = note.title || "";
    subjectEl.value = note.subject || "";
    authorEl.value = note.author || "";
    facultyEl.value = note.faculty || "others";
    contentTypeEl.value = note.contentType || "note";
    semesterEl.value = String(note.semester || 1);
    visibilityEl.value = note.visibility || "public";
    descriptionEl.value = note.description || "";
    textEl.value = note.textContent || "";

    if (note.images && note.images.length) {
        showAdminMessage(`This ${getContentTypeLabel(note).toLowerCase()} already has ${note.images.length} image${note.images.length === 1 ? "" : "s"}. Uploading new images will replace them.`);
    }

    clearFileInputs();
    if (heading) heading.textContent = "Edit Note";
    showAdminMessage("Editing existing note. Upload new files only if you want to replace current ones.");
    document.getElementById("noteForm")?.scrollIntoView({ behavior: "smooth", block: "start" });
};

window.deleteNote = async function (noteId) {
    if (!currentUser) return;
    const confirmed = confirm("Delete this note permanently?");
    if (!confirmed) return;

    try {
        await remove(ref(db, `notes/items/${noteId}`));
        showAdminMessage("Note deleted.");
    } catch (error) {
        showAdminMessage(error.message || "Failed to delete note.", true);
    }
};

onValue(publicNotesQuery, snapshot => {
    const data = snapshot.val();
    publicNotes = data ? Object.values(data).map(normalizeNote) : [];
    publicNotes.sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0));
    publicNotesLoaded = true;

    renderHome();
    resetClientPagination();
    renderClient();
});

onAuthStateChanged(auth, user => {
    currentUser = user;
    updateAdminUI();

    if (detachAdminNotes) {
        detachAdminNotes();
        detachAdminNotes = null;
    }

    if (user) {
        adminNotesLoaded = false;
        renderAdminNotes();
        detachAdminNotes = onValue(notesRef, snapshot => {
            const data = snapshot.val();
            adminNotes = data ? Object.values(data).map(normalizeNote) : [];
            adminNotes.sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0));
            adminNotesLoaded = true;
            renderAdminNotes();
        });
    } else {
        adminNotes = [];
        adminNotesLoaded = false;
        renderAdminNotes();
    }
});

const noteForm = document.getElementById("noteForm");
if (noteForm) {
    noteForm.addEventListener("submit", handleNoteSubmit);
}

function setupNavigationMenu() {
    const headers = document.querySelectorAll(".header");

    headers.forEach(header => {
        const toggle = header.querySelector("[data-nav-toggle]");
        const nav = header.querySelector(".nav");
        if (!toggle || !nav) return;

        const closeMenu = () => {
            header.classList.remove("header--nav-open");
            toggle.setAttribute("aria-expanded", "false");
        };

        toggle.addEventListener("click", () => {
            const isOpen = header.classList.toggle("header--nav-open");
            toggle.setAttribute("aria-expanded", String(isOpen));
        });

        nav.addEventListener("click", event => {
            if (event.target.closest("a")) {
                closeMenu();
            }
        });

        document.addEventListener("click", event => {
            if (!header.contains(event.target)) {
                closeMenu();
            }
        });
    });
}

function syncActiveClientNavLink() {
    const nav = document.getElementById("siteNav");
    if (!nav) return;

    const url = new URL(window.location.href);
    const isClientPage = url.pathname.toLowerCase().endsWith("client.html");
    if (!isClientPage) return;

    const contentType = (url.searchParams.get("contentType") || "note").toLowerCase();
    const links = nav.querySelectorAll(".nav__link");

    links.forEach(link => link.classList.remove("nav__link--active"));

    let target = null;
    if (contentType === "syllabus") {
        target = nav.querySelector('a[href*="contentType=syllabus"]');
    } else if (contentType === "question-paper") {
        target = nav.querySelector('a[href*="contentType=question-paper"]');
    } else {
        target = nav.querySelector('a[href*="contentType=note"]') || nav.querySelector('a[href="client.html"]');
    }

    if (target) target.classList.add("nav__link--active");
}

setupNavigationMenu();
renderHome();
renderClient();
renderAdminNotes();
syncActiveClientNavLink();
