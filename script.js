import { initializeApp } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-app.js";
import { getAuth, onAuthStateChanged, sendPasswordResetEmail, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";
import { getDatabase, onValue, ref, remove, set } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-database.js";

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

let notes = [];
let currentUser = null;
let clientVisibleCount = 12;
const CLIENT_PAGE_SIZE = 12;

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
    return notes.filter(isPublic);
}

function normalizeNote(note) {
    const type = note.type || "";
    const normalized = { ...note };

    if (!normalized.semester) {
        normalized.semester = 1;
    }

    if (!normalized.imageData && type === "image" && normalized.fileData) {
        normalized.imageData = normalized.fileData;
        normalized.imageName = normalized.fileName || "";
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
    if (note.imageData && note.pdfData) return "Contains image and PDF";
    if (note.imageData) return "Contains image";
    if (note.pdfData) return note.pdfName ? `PDF: ${note.pdfName}` : "Contains PDF";
    return "No preview available";
}

function getNoteKind(note) {
    const hasText = !!(note.textContent && note.textContent.trim());
    const hasImage = !!note.imageData;
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

function getCardVisual(note) {
    const visual = note.thumbnailData || "";
    if (!visual) return "";
    return `<img class="note-thumb" src="${visual}" loading="lazy" alt="${escapeHTML(note.title || "Note")}">`;
}

function buildNoteCard(note, options = {}) {
    const preview = escapeHTML(getNotePreview(note));
    const chips = `
        <div class="note-meta">
            <span class="chip">${escapeHTML(note.subject || "General")}</span>
            <span class="chip">${escapeHTML(getSemesterLabel(note.semester || 1))}</span>
            <span class="chip">${escapeHTML(getNoteKind(note))}</span>
            <span class="chip">${escapeHTML(note.visibility || "public")}</span>
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

function syncSubjectFilter(selectEl, sourceNotes) {
    if (!selectEl) return;
    const previousValue = selectEl.value || "all";
    const uniqueSubjects = [...new Set(sourceNotes.map(note => (note.subject || "General").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));

    selectEl.innerHTML = '<option value="all">All subjects</option>';
    uniqueSubjects.forEach(subject => {
        const option = document.createElement("option");
        option.value = subject;
        option.textContent = subject;
        selectEl.appendChild(option);
    });

    if (["all", ...uniqueSubjects].includes(previousValue)) {
        selectEl.value = previousValue;
    }
}

function renderHome() {
    const latestNotes = document.getElementById("latestNotes");
    const totalNotesCount = document.getElementById("totalNotesCount");
    const textNotesCount = document.getElementById("textNotesCount");
    const fileNotesCount = document.getElementById("fileNotesCount");

    if (!latestNotes) return;

    const publicNotes = getPublicNotes();
    const latest = publicNotes.slice(0, 4);

    if (totalNotesCount) totalNotesCount.textContent = String(publicNotes.length);
    if (textNotesCount) textNotesCount.textContent = String(publicNotes.filter(note => note.textContent && note.textContent.trim()).length);
    if (fileNotesCount) fileNotesCount.textContent = String(publicNotes.filter(note => note.imageData || note.pdfData).length);

    latestNotes.innerHTML = latest.length
        ? latest.map(note => buildNoteCard(note)).join("")
        : '<p class="notice">No notes yet. Add your first note from Admin Dashboard.</p>';
}

function renderClient() {
    const grid = document.getElementById("publicNotesGrid");
    if (!grid) return;

    const searchEl = document.getElementById("searchInput");
    const subjectEl = document.getElementById("subjectFilter");
    const semesterEl = document.getElementById("semesterFilter");
    const subjectSortEl = document.getElementById("subjectSort");
    const semesterSortEl = document.getElementById("semesterSort");
    const countEl = document.getElementById("clientResultCount");
    const loadMoreWrap = document.getElementById("clientLoadMoreWrap");
    const loadMoreBtn = document.getElementById("clientLoadMoreBtn");

    const publicNotes = getPublicNotes();
    syncSubjectFilter(subjectEl, publicNotes);

    const search = (searchEl ? searchEl.value : "").trim().toLowerCase();
    const subject = subjectEl ? subjectEl.value : "all";
    const semester = semesterEl ? semesterEl.value : "all";
    const subjectSort = subjectSortEl ? subjectSortEl.value : "none";
    const semesterSort = semesterSortEl ? semesterSortEl.value : "none";

    const filtered = publicNotes.filter(note => {
        const searchable = (note.searchText || `${note.title || ""} ${note.subject || ""} ${note.author || ""} ${note.description || ""}`).toLowerCase();
        const inSearch = !search || searchable.includes(search);

        const inSubject = subject === "all" || (note.subject || "General") === subject;
        const inSemester = semester === "all" || String(note.semester || 1) === semester;
        return inSearch && inSubject && inSemester;
    });

    filtered.sort((a, b) => {
        if (subjectSort !== "none") {
            const aSubject = (a.subject || "General").toLowerCase();
            const bSubject = (b.subject || "General").toLowerCase();
            if (aSubject < bSubject) return subjectSort === "asc" ? -1 : 1;
            if (aSubject > bSubject) return subjectSort === "asc" ? 1 : -1;
        }

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
        : '<p class="notice">No notes matched your filter.</p>';

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

    list.innerHTML = notes.length
        ? notes.map(note => buildNoteCard(note, { admin: true })).join("")
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
    const semesterEl = document.getElementById("semester");
    const visibilityEl = document.getElementById("visibility");
    const descriptionEl = document.getElementById("description");
    const textEl = document.getElementById("textContent");
    const imageEl = document.getElementById("imageInput");
    const pdfEl = document.getElementById("pdfInput");
    const thumbEl = document.getElementById("thumbnailInput");

    const id = noteIdEl && noteIdEl.value ? noteIdEl.value : createId();
    const existing = notes.find(note => note.id === id);

    const title = titleEl ? titleEl.value.trim() : "";
    const subject = subjectEl ? subjectEl.value.trim() : "";
    const author = authorEl ? authorEl.value.trim() : "";
    const semester = semesterEl ? Number(semesterEl.value || 1) : 1;
    const visibility = visibilityEl ? visibilityEl.value : "public";
    const description = descriptionEl ? descriptionEl.value.trim() : "";
    const textContent = textEl ? textEl.value.trim() : "";

    const imageFile = imageEl && imageEl.files ? imageEl.files[0] : null;
    const pdfFile = pdfEl && pdfEl.files ? pdfEl.files[0] : null;
    const thumbFile = thumbEl && thumbEl.files ? thumbEl.files[0] : null;

    if (!title || !subject || !author) {
        showAdminMessage("Title, subject, and author are required.", true);
        return;
    }

    let imageData = existing ? existing.imageData || "" : "";
    let imageName = existing ? existing.imageName || "" : "";
    let pdfData = existing ? existing.pdfData || "" : "";
    let pdfName = existing ? existing.pdfName || "" : "";
    let thumbnailData = existing ? existing.thumbnailData || "" : "";

    if (imageFile) {
        if (!imageFile.type.startsWith("image/")) {
            showAdminMessage("Image must be a valid image file.", true);
            return;
        }
        try {
            imageData = await readFileAsDataURL(imageFile);
            imageName = imageFile.name;
        } catch (error) {
            showAdminMessage(error.message || "Failed to read image file.", true);
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

    if (!textContent && !imageData && !pdfData) {
        showAdminMessage("Add at least one content input: text, image, or PDF.", true);
        return;
    }

    const payload = {
        id,
        slug: createSlug(title),
        title,
        subject,
        semester,
        author,
        visibility,
        description,
        textContent,
        textExcerpt: textContent ? textContent.slice(0, 400) : "",
        searchText: `${title} ${subject} ${author} ${description} ${textContent.slice(0, 600)}`,
        imageData,
        imageName,
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
    const note = notes.find(item => item.id === noteId);
    if (!note) return;

    const noteIdEl = document.getElementById("noteId");
    const titleEl = document.getElementById("title");
    const subjectEl = document.getElementById("subject");
    const authorEl = document.getElementById("author");
    const semesterEl = document.getElementById("semester");
    const visibilityEl = document.getElementById("visibility");
    const descriptionEl = document.getElementById("description");
    const textEl = document.getElementById("textContent");
    const heading = document.getElementById("formHeading");

    if (!noteIdEl || !titleEl || !subjectEl || !authorEl || !semesterEl || !visibilityEl || !descriptionEl || !textEl) {
        return;
    }

    noteIdEl.value = note.id;
    titleEl.value = note.title || "";
    subjectEl.value = note.subject || "";
    authorEl.value = note.author || "";
    semesterEl.value = String(note.semester || 1);
    visibilityEl.value = note.visibility || "public";
    descriptionEl.value = note.description || "";
    textEl.value = note.textContent || "";

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

onValue(notesRef, snapshot => {
    const data = snapshot.val();
    notes = data ? Object.values(data).map(normalizeNote) : [];
    notes.sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0));

    renderHome();
    resetClientPagination();
    renderClient();
    renderAdminNotes();
});

onAuthStateChanged(auth, user => {
    currentUser = user;
    updateAdminUI();
});

const noteForm = document.getElementById("noteForm");
if (noteForm) {
    noteForm.addEventListener("submit", handleNoteSubmit);
}
