import { initializeApp } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-app.js";
import { getDatabase, ref, set, onValue, remove, update } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-database.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";

// 1. Firebase Configuration
const firebaseConfig = {
    apiKey: "AIzaSyBh1s2S6rZe9zK4DLWpZUcpXtXZolEBQlI",
    authDomain: "webapp-e8b28.firebaseapp.com",
    projectId: "webapp-e8b28",
    storageBucket: "webapp-e8b28.firebasestorage.app",
    messagingSenderId: "126884302653",
    appId: "1:126884302653:web:2e0ab14def6bad3361ff54",
    measurementId: "G-GJVK5R349Q"
};

// 2. Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);
const booksRef = ref(db, 'library/books');

// 3. Local State
let books = [];
let currentSort = 'title';

// 4. Real-time Listener
onValue(booksRef, (snapshot) => {
    const data = snapshot.val();
    books = data ? Object.values(data) : [];
    render();
});

// --- AUTH LOGIC (Admin) ---
onAuthStateChanged(auth, (user) => {
    if (user) {
        sessionStorage.setItem('isAdminLoggedIn', 'true');
    } else {
        sessionStorage.removeItem('isAdminLoggedIn');
    }
    updateAdminVisibility();
});

window.checkPassword = function () {
    const email = document.getElementById('adminEmail').value;
    const pass = document.getElementById('adminPass').value;
    const errorEl = document.getElementById('loginError');

    signInWithEmailAndPassword(auth, email, pass)
        .then(() => {
            errorEl.style.display = 'none';
        })
        .catch((error) => {
            console.error(error);
            errorEl.innerText = "Invalid Email or Password";
            errorEl.style.display = 'block';
        });
}

window.forgotPassword = function () {
    const email = document.getElementById('adminEmail').value;
    if (!email) {
        alert("Please enter your email address in the field above first.");
        return;
    }
    sendPasswordResetEmail(auth, email)
        .then(() => {
            alert("Password reset email sent! Check your inbox.");
        })
        .catch((error) => {
            alert("Error: " + error.message);
        });
}

function updateAdminVisibility() {
    const isLoggedIn = sessionStorage.getItem('isAdminLoggedIn') === 'true';
    const loginSec = document.getElementById('loginSection');
    const adminCont = document.getElementById('adminContent');
    const logoutBtn = document.getElementById('logoutBtn');

    if (loginSec && adminCont) {
        loginSec.style.display = isLoggedIn ? 'none' : 'block';
        adminCont.style.display = isLoggedIn ? 'block' : 'none';
        if (logoutBtn) logoutBtn.style.display = isLoggedIn ? 'block' : 'none';
    }
}

window.logout = function () {
    signOut(auth).then(() => {
        // State change listener will handle UI update
    });
}

// --- STUDENT AUTH LOGIC ---
function checkStudentAuth() {
    const studentLoginSec = document.getElementById('studentLoginSection');
    const catalogTitle = document.getElementById('catalogTitle');
    const searchBar = document.getElementById('searchBar');
    const bookList = document.getElementById('clientBookList');
    const logoutBtn = document.getElementById('studentLogoutBtn');

    onAuthStateChanged(auth, (user) => {
        if (user) {
            // Student is logged in
            if (studentLoginSec) studentLoginSec.style.display = 'none';
            if (catalogTitle) catalogTitle.style.display = 'block';
            if (searchBar) searchBar.style.display = 'flex';
            if (bookList) bookList.style.display = 'grid';
            if (logoutBtn) logoutBtn.style.display = 'inline-block';
            render(); 
        } else {
            // No student logged in
            if (studentLoginSec) studentLoginSec.style.display = 'flex';
            if (catalogTitle) catalogTitle.style.display = 'none';
            if (searchBar) searchBar.style.display = 'none';
            if (bookList) bookList.style.display = 'none';
            if (logoutBtn) logoutBtn.style.display = 'none';
        }
    });
}

// UPDATED: Use Student ID for login
window.loginStudent = function () {
    const studentIdInput = document.getElementById('studentEmail').value;
    const pass = document.getElementById('studentPass').value;
    const errorEl = document.getElementById('studentLoginError');

    if (!studentIdInput || !pass) {
        errorEl.innerText = "Please enter ID and Password";
        errorEl.style.display = 'block';
        return;
    }

    // Combine ID with mock domain for Firebase Email Auth
    const mockEmail = `${studentIdInput.trim()}@library.system`;

    console.log("Attempting sign in as:", mockEmail); // Debugging

    signInWithEmailAndPassword(auth, mockEmail, pass)
        .then(() => {
            errorEl.style.display = 'none';
            // Successful login
        })
        .catch((error) => {
            console.error("Login Error:", error);
            if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
                errorEl.innerText = "Invalid ID or Password";
            } else {
                errorEl.innerText = "Error: " + error.message;
            }
            errorEl.style.display = 'block';
        });
}

window.logoutStudent = function () {
    signOut(auth).then(() => {
        window.location.reload();
    });
}

// --- SEARCH & SORT LOGIC (Client) ---
window.filterBooks = function () {
    render();
}

window.changeSort = function (sortValue) {
    currentSort = sortValue;
    render();
}

// --- CORE ACTIONS (Firebase) ---

// Add Book
const bookForm = document.getElementById('bookForm');
if (bookForm) {
    bookForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const id = Date.now().toString();
        const newBook = {
            id: id,
            title: document.getElementById('title').value,
            author: document.getElementById('author').value,
            category: document.getElementById('category').value || "Uncategorized",
            aisle: document.getElementById('aisle').value || "N/A",
            total: parseInt(document.getElementById('quantity').value) || 1,
            issuedTo: []
        };

        set(ref(db, 'library/books/' + id), newBook);
        e.target.reset();
    });
}

// EDIT BOOK - MODIFIED
window.editBook = function (bookId) {
    const book = books.find(b => b.id == bookId);
    if (!book) return;

    // Prompt for all fields
    const newTitle = prompt("Enter New Title:", book.title);
    const newAuthor = prompt("Enter New Author:", book.author);
    const newCategory = prompt("Enter New Category:", book.category || "");
    const newAisle = prompt("Enter New Aisle No:", book.aisle || "");

    // Ensure user didn't click "Cancel" (prompt returns null if canceled)
    if (newTitle !== null && newAuthor !== null && newCategory !== null && newAisle !== null) {
        
        // Update in Firebase
        update(ref(db, 'library/books/' + bookId), {
            title: newTitle,
            author: newAuthor,
            category: newCategory,
            aisle: newAisle
        }).then(() => {
            alert("Book details updated successfully!");
        }).catch((error) => {
            alert("Error updating book: " + error.message);
        });
    }
}

// ISSUE BOOK
window.issueToUser = function (bookId) {
    const book = books.find(b => b.id == bookId);

    if (!book) return;
    if (!book.issuedTo) book.issuedTo = [];

    if (book.issuedTo.length < book.total) {
        const userId = prompt("Enter User/Student ID:");
        if (userId) {
            book.issuedTo.push(userId);
            update(ref(db, 'library/books/' + bookId), { issuedTo: book.issuedTo });
        }
    } else { alert("No copies available!"); }
}

// RETURN BOOK
window.returnFromUser = function (bookId) {
    const book = books.find(b => b.id == bookId);

    if (!book) return;
    if (!book.issuedTo) book.issuedTo = [];

    if (book.issuedTo.length > 0) {
        const userId = prompt(`Enter ID returning book:\nCurrently held by: ${book.issuedTo.join(', ')}`);
        const index = book.issuedTo.indexOf(userId);
        if (index > -1) {
            book.issuedTo.splice(index, 1);
            update(ref(db, 'library/books/' + bookId), { issuedTo: book.issuedTo });
        } else { alert("User ID not found!"); }
    }
}

// DELETE BOOK
window.deleteBook = function (id) {
    if (confirm("Delete this book permanently?")) {
        remove(ref(db, 'library/books/' + id));
    }
}

// --- DOWNLOAD CSV LOGIC ---
window.downloadCSV = function () {
    if (books.length === 0) {
        alert("No data to download.");
        return;
    }

    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Book Title,Author,Category,Aisle No,Total Copies,Available,Borrowed By (IDs)\n";

    books.forEach(book => {
        const available = book.total - (book.issuedTo ? book.issuedTo.length : 0);
        const borrowedBy = book.issuedTo ? book.issuedTo.join('; ') : "None";
        const row = `"${book.title}","${book.author}","${book.category || 'N/A'}","${book.aisle || 'N/A'}",${book.total},${available},"${borrowedBy}"`;
        csvContent += row + "\n";
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `library_report_${new Date().toLocaleDateString()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// --- QR MODAL ---
// UPDATED: Use ID instead of Email for QR
window.showQR = function (id, title) {
    if (!auth.currentUser) {
        alert("Please login to view QR codes.");
        return;
    }

    const modal = document.getElementById('qrModal');
    const qrContainer = document.getElementById('qrcode');
    if (!modal || !qrContainer) return;

    qrContainer.innerHTML = "";
    document.getElementById('qrText').innerText = title;
    modal.style.display = "block";

    // Extract student ID from the mock email
    const studentId = auth.currentUser.email.split('@')[0];
    const url = `https://somyajha1233.github.io/LibraryApp/scanner.html?bookId=${id}&student=${studentId}`;
    new QRCode(qrContainer, { text: url, width: 180, height: 180 });
}

window.closeModal = function () {
    const modal = document.getElementById('qrModal');
    if (modal) modal.style.display = "none";
}

// --- RENDER & SORT ---
function render() {
    const adminList = document.getElementById('adminBookList');
    const clientList = document.getElementById('clientBookList');
    const searchInput = document.getElementById('searchInput');
    const searchTerm = searchInput ? searchInput.value.toLowerCase() : "";

    // 1. Filter
    let processedBooks = books.filter(b =>
        b.title.toLowerCase().includes(searchTerm) ||
        b.author.toLowerCase().includes(searchTerm) ||
        (b.category && b.category.toLowerCase().includes(searchTerm))
    );

    // 2. Sort
    processedBooks.sort((a, b) => {
        let valA = (a[currentSort] || "").toString().toLowerCase();
        let valB = (b[currentSort] || "").toString().toLowerCase();

        if (valA < valB) return -1;
        if (valA > valB) return 1;
        return 0;
    });

    if (adminList) {
        adminList.innerHTML = processedBooks.length === 0
            ? '<tr><td colspan="6" style="text-align:center">No books found.</td></tr>'
            : processedBooks.map(b => {
                // --- FIX: Recalculate Available Stock ---
                const issuedCount = b.issuedTo ? b.issuedTo.length : 0;
                const available = b.total - issuedCount;
                // --- FIX END ---
                
                return `
            <tr>
                <td data-label="Book"><strong>${b.title}</strong><br><small>${b.author}</small></td>
                <td data-label="Category">${b.category || 'N/A'}</td>
                <td data-label="Aisle">${b.aisle || 'N/A'}</td>
                
                <td data-label="Stock"><strong>${available}</strong> / ${b.total}</td>
                
                <td data-label="Borrowed By">
                    ${(b.issuedTo && b.issuedTo.length > 0)
                    ? b.issuedTo.map(id => `<span class="user-badge" style="background:#fee2e2; padding:2px 6px; border-radius:4px; margin:2px; display:inline-block;">${id}</span>`).join(' ')
                    : '<span style="color: #bbb;">None</span>'}
                </td>
                <td data-label="Actions">
                    <button class="edit-btn" style="background:#f39c12; color:white; padding:5px 10px; border-radius:5px; border:none; cursor:pointer;" onclick="editBook('${b.id}')">Edit</button>
                    <button class="issue-btn" style="background:#27ae60; color:white; padding:5px 10px; border-radius:5px; border:none; cursor:pointer;" onclick="issueToUser('${b.id}')">Issue</button>
                    <button class="return-btn" style="background:#3498db; color:white; padding:5px 10px; border-radius:5px; border:none; cursor:pointer;" onclick="returnFromUser('${b.id}')">Return</button>
                    <button class="delete-btn" style="background:#e74c3c; color:white; padding:5px 10px; border-radius:5px; border:none; cursor:pointer;" onclick="deleteBook('${b.id}')">Del</button>
                </td>
            </tr>
        `;
            }).join('');
    }

    if (clientList) {
        clientList.innerHTML = processedBooks.length === 0
            ? '<p class="work-sans">No books match your search.</p>'
            : processedBooks.map(b => {
                const avail = b.total - (b.issuedTo ? b.issuedTo.length : 0);
                const safeTitle = b.title.replace(/'/g, "\\'");
                return `
                    <div class="book-card">
                        <div>
                            <h4 class="book-title">${b.title}</h4>
                            <p class="book-author">By ${b.author}</p>
                            <div class="book-details">
                                <div class="book-detail-item">
                                    <i class="fas fa-tag"></i>
                                    <span>${b.category || 'Uncategorized'}</span>
                                </div>
                                <div class="book-detail-item">
                                    <i class="fas fa-map-marker-alt"></i>
                                    <span>Aisle ${b.aisle || 'N/A'}</span>
                                </div>
                                <div class="book-detail-item">
                                    <i class="fas fa-book"></i>
                                    <span><strong>${avail}</strong> of ${b.total} available</span>
                                </div>
                            </div>
                        </div>
                        ${avail > 0
                        ? `<button class="issue-btn" onclick="showQR('${b.id}', '${safeTitle}')">
                                <i class="fas fa-qrcode" style="margin-right: 6px;"></i>Show QR Code
                           </button>`
                        : `<div style="padding: 0.9rem; text-align: center; background: #fee2e2; border-radius: 8px; color: #991b1b; font-weight: 500; font-family: 'Work Sans', sans-serif; font-size: 0.9rem;">
                                <i class="fas fa-exclamation-circle" style="margin-right: 6px;"></i>Out of Stock
                           </div>`}
                    </div>
                `;
            }).join('');
    }
}

window.onload = () => {
    updateAdminVisibility(); 
    checkStudentAuth();
    render();
};