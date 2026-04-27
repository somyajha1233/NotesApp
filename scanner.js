// Import Firebase modules from CDN
// initializeApp → starts Firebase
// getDatabase → connects to Realtime Database
// ref, set, onValue, remove, update → database operations
// getAuth, signInWithEmailAndPassword, etc → authentication functions
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-app.js";
import { getDatabase, ref, set, onValue, remove, update } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-database.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";


// ==========================
// 1. FIREBASE CONFIGURATION
// ==========================
// This connects your website to your Firebase project
const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "webapp-e8b28.firebaseapp.com",
    projectId: "webapp-e8b28",
    storageBucket: "webapp-e8b28.firebasestorage.app",
    messagingSenderId: "126884302653",
    appId: "1:126884302653:web:2e0ab14def6bad3361ff54",
    measurementId: "G-GJVK5R349Q"
};


// ==========================
// 2. INITIALIZE FIREBASE
// ==========================

// Start Firebase using your config
const app = initializeApp(firebaseConfig);

// Connect to realtime database
const db = getDatabase(app);

// Connect to authentication system
const auth = getAuth(app);

// Reference to books location in database
// Path in database = library → books
const booksRef = ref(db, 'library/books');


// ==========================
// 3. LOCAL VARIABLES
// ==========================

// This will store books locally after loading from Firebase
let books = [];

// Default sorting method
let currentSort = 'title';


// ==========================
// 4. REALTIME DATABASE LISTENER
// ==========================

// onValue listens for changes in database
// Runs automatically whenever data changes
onValue(booksRef, (snapshot) => {

    // Get data from Firebase
    const data = snapshot.val();

    // Convert object into array
    books = data ? Object.values(data) : [];

    // Update UI
    render();
});


// ==========================
// ADMIN AUTHENTICATION
// ==========================

// This runs whenever login/logout happens
onAuthStateChanged(auth, (user) => {

    if (user) {
        // If logged in, store flag in sessionStorage
        sessionStorage.setItem('isAdminLoggedIn', 'true');
    } else {
        // If logged out, remove flag
        sessionStorage.removeItem('isAdminLoggedIn');
    }

    // Update UI accordingly
    updateAdminVisibility();
});


// ==========================
// ADMIN LOGIN FUNCTION
// ==========================

window.checkPassword = function () {

    // Get email and password from input
    const email = document.getElementById('adminEmail').value;
    const pass = document.getElementById('adminPass').value;

    const errorEl = document.getElementById('loginError');

    // Try logging in using Firebase Auth
    signInWithEmailAndPassword(auth, email, pass)

        .then(() => {
            // Success → hide error
            errorEl.style.display = 'none';
        })

        .catch((error) => {
            // Failed → show error
            console.error(error);
            errorEl.innerText = "Invalid Email or Password";
            errorEl.style.display = 'block';
        });
}


// ==========================
// PASSWORD RESET FUNCTION
// ==========================

window.forgotPassword = function () {

    const email = document.getElementById('adminEmail').value;

    if (!email) {
        alert("Enter email first.");
        return;
    }

    // Send reset email
    sendPasswordResetEmail(auth, email)

        .then(() => {
            alert("Password reset email sent.");
        })

        .catch((error) => {
            alert("Error: " + error.message);
        });
}


// ==========================
// SHOW/HIDE ADMIN UI
// ==========================

function updateAdminVisibility() {

    const isLoggedIn = sessionStorage.getItem('isAdminLoggedIn') === 'true';

    const loginSec = document.getElementById('loginSection');
    const adminCont = document.getElementById('adminContent');
    const logoutBtn = document.getElementById('logoutBtn');

    if (loginSec && adminCont) {

        // Show login if not logged in
        loginSec.style.display = isLoggedIn ? 'none' : 'block';

        // Show admin panel if logged in
        adminCont.style.display = isLoggedIn ? 'block' : 'none';

        if (logoutBtn)
            logoutBtn.style.display = isLoggedIn ? 'block' : 'none';
    }
}


// ==========================
// ADMIN LOGOUT
// ==========================

window.logout = function () {

    // Sign out from Firebase
    signOut(auth);
};


// ==========================
// STUDENT LOGIN SYSTEM
// ==========================

window.loginStudent = function () {

    // Student enters ID (not email)
    const studentIdInput = document.getElementById('studentEmail').value;

    const pass = document.getElementById('studentPass').value;

    const errorEl = document.getElementById('studentLoginError');

    if (!studentIdInput || !pass) {

        errorEl.innerText = "Enter ID and Password";
        errorEl.style.display = 'block';
        return;
    }

    // Convert student ID to fake email
    // Example:
    // ID: 12345
    // Email: 12345@library.system
    const mockEmail = `${studentIdInput.trim()}@library.system`;

    // Try login
    signInWithEmailAndPassword(auth, mockEmail, pass)

        .then(() => {

            errorEl.style.display = 'none';
        })

        .catch((error) => {

            errorEl.innerText = "Invalid ID or Password";
            errorEl.style.display = 'block';
        });
};


// ==========================
// STUDENT LOGOUT
// ==========================

window.logoutStudent = function () {

    signOut(auth).then(() => {

        // Reload page after logout
        window.location.reload();
    });
};


// ==========================
// ADD BOOK FUNCTION
// ==========================

const bookForm = document.getElementById('bookForm');

if (bookForm) {

    bookForm.addEventListener('submit', (e) => {

        // Prevent page reload
        e.preventDefault();

        // Create unique ID using timestamp
        const id = Date.now().toString();

        // Create book object
        const newBook = {

            id: id,

            title: document.getElementById('title').value,

            author: document.getElementById('author').value,

            category: document.getElementById('category').value || "Uncategorized",

            aisle: document.getElementById('aisle').value || "N/A",

            total: parseInt(document.getElementById('quantity').value) || 1,

            issuedTo: []
        };

        // Save book to Firebase
        set(ref(db, 'library/books/' + id), newBook);

        // Reset form
        e.target.reset();
    });
}


// ==========================
// DELETE BOOK
// ==========================

window.deleteBook = function (id) {

    if (confirm("Delete this book?")) {

        // Remove from Firebase
        remove(ref(db, 'library/books/' + id));
    }
};


// ==========================
// ISSUE BOOK
// ==========================

window.issueToUser = function (bookId) {

    const book = books.find(b => b.id == bookId);

    if (!book) return;

    if (!book.issuedTo)
        book.issuedTo = [];

    // Check if available
    if (book.issuedTo.length < book.total) {

        const userId = prompt("Enter Student ID:");

        if (userId) {

            book.issuedTo.push(userId);

            update(ref(db, 'library/books/' + bookId), {
                issuedTo: book.issuedTo
            });
        }
    }

    else {
        alert("No copies available");
    }
};


// ==========================
// RETURN BOOK
// ==========================

window.returnFromUser = function (bookId) {

    const book = books.find(b => b.id == bookId);

    if (!book) return;

    const userId = prompt("Enter returning student ID:");

    const index = book.issuedTo.indexOf(userId);

    if (index > -1) {

        book.issuedTo.splice(index, 1);

        update(ref(db, 'library/books/' + bookId), {

            issuedTo: book.issuedTo
        });
    }
};


// ==========================
// RENDER FUNCTION
// ==========================
// This displays books on screen

function render() {

    const clientList = document.getElementById('clientBookList');

    if (!clientList) return;

    clientList.innerHTML = books.map(b => {

        const available = b.total - (b.issuedTo?.length || 0);

        return `
            <div>
                <h3>${b.title}</h3>
                <p>${b.author}</p>
                <p>Available: ${available}</p>
            </div>
        `;
    }).join('');
}


// ==========================
// PAGE LOAD
// ==========================

window.onload = () => {

    updateAdminVisibility();

    render();
};
