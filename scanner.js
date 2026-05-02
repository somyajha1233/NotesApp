import { initializeApp } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-app.js";
import { get, getDatabase, ref } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-database.js";

const firebaseConfig = {
    apiKey: "AIzaSyBPUpuoCS4buG47IJ6ns_OCIbt3YnekK3M",
    authDomain: "my-uni-notes.firebaseapp.com",
    databaseURL: "https://my-uni-notes-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "my-uni-notes",
    storageBucket: "my-uni-notes.firebasestorage.app",
    messagingSenderId: "379227696615",
    appId: "1:379227696615:web:5c89d6419b4584ab9da142"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

const statusEl = document.getElementById("noteDetailStatus");
const contentEl = document.getElementById("noteDetailContent");

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

function getSemesterLabel(semester) {
    const value = Number(semester) || 1;
    const suffixMap = { 1: "st", 2: "nd", 3: "rd" };
    const suffix = suffixMap[value] || "th";
    return `${value}${suffix} Semester`;
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

    return normalized;
}

function showError(message) {
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.style.color = "#a32727";
}

function showNote(note) {
    if (!statusEl || !contentEl) return;

    statusEl.classList.add("hidden");
    contentEl.classList.remove("hidden");

    const images = Array.isArray(note.images) ? note.images : [];
    const imageBlock = images.length
        ? `
            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:0.85rem; margin-bottom:0.8rem;">
                ${images.map((image, index) => `
                    <figure style="margin:0;">
                        <img class="note-thumb" style="max-height:460px; object-fit:contain; background:#fff;" src="${image.data}" alt="${escapeHTML(note.title || "Note Image")} ${index + 1}">
                        ${image.name ? `<figcaption style="font-size:0.78rem; color:#7a6253; margin-top:0.35rem;">${escapeHTML(image.name)}</figcaption>` : ""}
                    </figure>
                `).join("")}
            </div>
        `
        : "";

    const pdfSource = note.pdfUrl || note.pdfData || "";

    const pdfBlock = pdfSource
        ? `
            <div class="actions" style="margin:0.8rem 0;">
                <a class="btn" href="${pdfSource}" download="${escapeHTML(note.pdfName || "note.pdf")}">Download PDF</a>
                <a class="btn secondary" href="${pdfSource}" target="_blank" rel="noopener noreferrer">Open PDF</a>
            </div>
            <iframe src="${pdfSource}" title="PDF note" style="width:100%; min-height:560px; border:1px solid #e5d8c6; border-radius:12px;"></iframe>
        `
        : "";

    const metaParts = [];
    metaParts.push(`<span class="${note.contentType === "question-paper" ? "content-type-pill content-type-pill--question-paper" : note.contentType === "syllabus" ? "content-type-pill content-type-pill--syllabus" : "content-type-pill"}">${escapeHTML(note.contentType === "question-paper" ? "Question Paper" : note.contentType === "syllabus" ? "Syllabus" : "Note")}</span>`);
    const facultyVal = (note.faculty || "").toLowerCase();
    if (facultyVal && facultyVal !== "others") {
        metaParts.push(`<span class="chip">${escapeHTML((note.faculty || "").toUpperCase())}</span>`);
    }
    const subj = (note.subject || "").trim();
    if (subj && subj.toLowerCase() !== "computer") {
        metaParts.push(`<span class="chip">${escapeHTML(subj || "General")}</span>`);
    }
    metaParts.push(`<span class="chip">${escapeHTML(getSemesterLabel(note.semester || 1))}</span>`);

    contentEl.innerHTML = `
        <div class="note-meta" style="margin-bottom:0.8rem;">
            ${metaParts.join('\n')}
        </div>
        <h1 class="hero-title" style="font-size:2.2rem; margin-bottom:0.5rem;">${escapeHTML(note.title || "Untitled")}</h1>
        <p class="note-preview" style="margin-bottom:0.5rem;">By ${escapeHTML(note.author || "Unknown")} • Updated ${escapeHTML(formatDate(note.updatedAt || note.createdAt))}</p>
        ${note.description ? `<p style="margin-bottom:0.9rem; color:#7a6253;">${escapeHTML(note.description)}</p>` : ""}
        ${note.thumbnailData ? `<img class="note-thumb" style="max-height:260px; margin-bottom:0.8rem;" src="${note.thumbnailData}" alt="${escapeHTML(note.title || "Thumbnail")}">` : ""}
        ${note.textContent ? `<div class="panel" style="box-shadow:none; background:#fff; border-style:dashed; margin-bottom:0.8rem;"><p style="white-space:pre-wrap;">${escapeHTML(note.textContent)}</p></div>` : ""}
        ${imageBlock}
        ${pdfBlock}
        ${(!note.textContent && !images.length && !pdfSource) ? '<p class="notice">This note does not contain readable content.</p>' : ""}
    `;
}

async function init() {
    const url = new URL(window.location.href);
    const noteSlug = url.searchParams.get("slug");
    const noteId = url.searchParams.get("id");

    if (!noteSlug && !noteId) {
        showError("Missing note slug in URL.");
        return;
    }

    try {
        let note = null;

        if (noteSlug) {
            const snapshot = await get(ref(db, "notes/items"));
            if (!snapshot.exists()) {
                showError("Note not found.");
                return;
            }

            const allNotes = Object.values(snapshot.val());
            note = allNotes
                .map(normalizeNote)
                .find(item => (item.slug || "") === noteSlug);
        }

        if (!note && noteId) {
            const snapshot = await get(ref(db, `notes/items/${noteId}`));
            if (snapshot.exists()) {
                note = normalizeNote(snapshot.val());
            }
        }

        if (!note) {
            showError("Note not found.");
            return;
        }

        if ((note.visibility || "public") !== "public") {
            showError("This note is private.");
            return;
        }

        showNote(note);
    } catch (error) {
        showError(error.message || "Failed to load note.");
    }
}

init();

if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
        navigator.serviceWorker.register("sw.js").catch(() => {
            // Ignore registration failures in unsupported environments.
        });
    });
}
